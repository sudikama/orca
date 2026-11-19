import { useCallback, useEffect, useRef, useState } from 'react'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import {
  MarketplaceListSchema,
  PLUGIN_APPROVAL_CODES,
  PluginApprovalRequestSchema,
  PluginListSchema,
  PluginLogsSchema,
  type MarketplaceListing,
  type PluginApprovalRequest,
  type PluginListEntry,
  type PluginLogLine
} from './plugin-rpc-schemas'

type PendingApproval = {
  request: PluginApprovalRequest
  busy: string
  method: string
  params: Record<string, unknown>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The host's plugins and marketplace, with every change the phone can make to them. */
export function useHostPlugins(client: RpcClient | null, connected: boolean) {
  const [plugins, setPlugins] = useState<PluginListEntry[] | null>(null)
  const [systemEnabled, setSystemEnabled] = useState<boolean | null>(null)
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [approval, setApproval] = useState<PendingApproval | null>(null)
  const runRef = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    if (!client) {
      return
    }
    runRef.current += 1
    const run = runRef.current
    setLoading(true)
    try {
      const [listRes, marketRes] = await Promise.all([
        client.sendRequest('plugins.list'),
        client.sendRequest('plugins.marketplaceList')
      ])
      if (run !== runRef.current) {
        return
      }
      if (marketRes.ok) {
        const market = MarketplaceListSchema.safeParse(marketRes.result)
        if (market.success) {
          setSystemEnabled(market.data.systemEnabled)
          setListings(market.data.listings)
        }
      } else {
        setNotice(marketRes.error.message)
      }
      if (listRes.ok) {
        const list = PluginListSchema.safeParse(listRes.result)
        if (list.success) {
          setPlugins(list.data)
        }
      } else {
        setNotice(listRes.error.message)
      }
    } catch (error) {
      setNotice(messageOf(error))
    } finally {
      if (run === runRef.current) {
        setLoading(false)
      }
    }
  }, [client])

  useEffect(() => {
    if (connected) {
      void load()
    }
  }, [connected, load])

  // A change that needs approval comes back refused with the access it asks for; the approval
  // sheet shows it and approve() sends the same change again with its fingerprint.
  const mutate = useCallback(
    async (
      busy: string,
      method: string,
      params: Record<string, unknown>,
      doneNotice?: string
    ): Promise<void> => {
      if (!client) {
        return
      }
      setBusyKey(busy)
      setNotice(null)
      try {
        const res = await client.sendRequest(method, params)
        if (res.ok) {
          if (doneNotice) {
            setNotice(doneNotice)
          }
        } else {
          const request = PLUGIN_APPROVAL_CODES.has(res.error.code)
            ? PluginApprovalRequestSchema.safeParse(res.error.data)
            : null
          if (request?.success) {
            setApproval({ request: request.data, busy, method, params })
          } else {
            setNotice(res.error.message)
          }
        }
      } catch (error) {
        setNotice(messageOf(error))
      } finally {
        setBusyKey(null)
      }
      await load()
    },
    [client, load]
  )

  const approve = useCallback(async (): Promise<void> => {
    const pending = approval
    setApproval(null)
    if (pending) {
      await mutate(pending.busy, pending.method, {
        ...pending.params,
        approvalFingerprint: pending.request.approvalFingerprint
      })
    }
  }, [approval, mutate])

  const readLogs = useCallback(
    async (pluginKey: string): Promise<PluginLogLine[]> => {
      if (!client) {
        return []
      }
      try {
        const res = await client.sendRequest('plugins.getLogs', { pluginKey })
        if (!res.ok) {
          setNotice(res.error.message)
          return []
        }
        const logs = PluginLogsSchema.safeParse(res.result)
        return logs.success ? logs.data.lines : []
      } catch (error) {
        setNotice(messageOf(error))
        return []
      }
    },
    [client]
  )

  return {
    plugins,
    systemEnabled,
    listings,
    loading,
    busyKey,
    notice,
    approval: approval?.request ?? null,
    reload: load,
    clearNotice: () => setNotice(null),
    dismissApproval: () => setApproval(null),
    approve,
    readLogs,
    setSystemEnabled: (enabled: boolean) =>
      mutate('system', 'plugins.setSystemEnabled', { enabled }),
    setEnabled: (pluginKey: string, enabled: boolean) =>
      mutate(pluginKey, 'plugins.setEnabled', { pluginKey, enabled }),
    install: (pluginKey: string) =>
      mutate(pluginKey, 'plugins.install', { source: { kind: 'catalog', pluginKey } }),
    update: (pluginKey: string) => mutate(pluginKey, 'plugins.update', { pluginKey }),
    uninstall: (pluginKey: string) => mutate(pluginKey, 'plugins.uninstall', { pluginKey }),
    restart: (pluginKey: string) => mutate(pluginKey, 'plugins.restart', { pluginKey }),
    runCommand: (pluginKey: string, commandId: string, doneNotice: string) =>
      mutate(pluginKey, 'plugins.invokeCommand', { pluginKey, commandId }, doneNotice)
  }
}

export type HostPlugins = ReturnType<typeof useHostPlugins>
