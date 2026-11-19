import { useCallback, useEffect, useRef, useState } from 'react'
import * as z from 'zod'
import { ProviderRateLimitsSchema, type ProviderRateLimits } from '../accounts-snapshot'
import type { RpcClient } from '../../transport/rpc/rpc-client-contract'

const TARGET = { runtime: 'host' } as const

// Why: the host records an account's quota whenever it reads Antigravity usage while that
// account is signed in, so this only reads the saved list and never starts a quota read.
const AccountStateSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.string(),
      email: z.string().nullable(),
      subject: z.string().nullable(),
      authMethod: z.string(),
      createdAt: z.number(),
      updatedAt: z.number(),
      usage: ProviderRateLimitsSchema.nullable().optional().catch(null)
    })
  ),
  activeAccountId: z.string().nullable(),
  currentAccount: z
    .object({
      email: z.string().nullable(),
      subject: z.string().nullable(),
      authMethod: z.string(),
      identityKnown: z.boolean()
    })
    .nullable(),
  selectedAccountId: z.string().nullable()
})

export type AntigravityAccountsData = {
  state: z.infer<typeof AccountStateSchema>
  usage: { accountId: string; limits: ProviderRateLimits | null }[]
}

/**
 * Antigravity's saved accounts with each one's last recorded quota. `usageUpdatedAt` is the
 * account stream's Antigravity reading time: a new reading is when the host records quota, so
 * the list is read again then.
 */
export function useAntigravityAccounts(
  client: RpcClient | null,
  enabled: boolean,
  usageUpdatedAt: number | null
) {
  const [data, setData] = useState<AntigravityAccountsData | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const runRef = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    if (!client) {
      return
    }
    const run = runRef.current
    try {
      const res = await client.sendRequest('accounts.antigravityList', TARGET)
      if (run !== runRef.current || !res.ok) {
        return
      }
      const parsed = AccountStateSchema.safeParse(res.result)
      if (!parsed.success) {
        return
      }
      setData({
        state: parsed.data,
        usage: parsed.data.accounts.map((account) => ({
          accountId: account.id,
          limits: account.usage ?? null
        }))
      })
    } catch {
      // A failed read leaves the last list on screen.
    }
  }, [client])

  useEffect(() => {
    runRef.current += 1
    if (enabled) {
      void load()
    }
    return () => {
      runRef.current += 1
    }
  }, [enabled, load, usageUpdatedAt])

  const mutate = useCallback(
    async (method: string, accountId: string) => {
      if (!client) {
        return
      }
      setBusy(true)
      setNotice(null)
      try {
        const res = await client.sendRequest(method, { target: TARGET, accountId })
        if (!res.ok) {
          setNotice(res.error.message)
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(false)
      }
      await load()
    },
    [client, load]
  )

  return {
    data,
    busy,
    notice,
    clearNotice: () => setNotice(null),
    reload: load,
    select: (accountId: string) => mutate('accounts.antigravitySelect', accountId),
    remove: (accountId: string) => mutate('accounts.antigravityRemove', accountId)
  }
}
