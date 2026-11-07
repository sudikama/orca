import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { ProviderRateLimitsSchema } from '../../components/accounts-snapshot'
import type { RpcClient } from '../../transport/rpc-client'

const TARGET = { runtime: 'host' } as const
// The host reads each saved account's quota in the background; poll until every read ends.
const POLL_MS = 3_000
const MAX_POLLS = 40

const AccountsDataSchema = z.object({
  state: z.object({
    accounts: z.array(
      z.object({
        id: z.string(),
        email: z.string().nullable(),
        subject: z.string().nullable(),
        authMethod: z.string(),
        createdAt: z.number(),
        updatedAt: z.number()
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
  }),
  usage: z.array(
    z.object({
      accountId: z.string(),
      limits: ProviderRateLimitsSchema.nullable(),
      fetching: z.boolean()
    })
  )
})

export type AntigravityAccountsData = z.infer<typeof AccountsDataSchema>

/** Antigravity's saved accounts with each one's quota, kept fresh while the host reads them. */
export function useAntigravityAccounts(client: RpcClient | null, enabled: boolean) {
  const [data, setData] = useState<AntigravityAccountsData | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const runRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(
    async (refresh: boolean, polls = 0): Promise<void> => {
      if (!client) {
        return
      }
      const run = runRef.current
      try {
        const res = await client.sendRequest('accounts.antigravityUsage', refresh ? { refresh } : {})
        if (run !== runRef.current || !res.ok) {
          return
        }
        const parsed = AccountsDataSchema.safeParse(res.result)
        if (!parsed.success) {
          return
        }
        setData(parsed.data)
        if (parsed.data.usage.some((entry) => entry.fetching) && polls < MAX_POLLS) {
          timerRef.current = setTimeout(() => void load(false, polls + 1), POLL_MS)
        }
      } catch {
        // A missed poll leaves the last quota on screen.
      }
    },
    [client]
  )

  const refresh = useCallback(() => load(true), [load])

  useEffect(() => {
    runRef.current += 1
    if (enabled) {
      void load(false)
    }
    return () => {
      runRef.current += 1
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [enabled, load])

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
      await load(false)
    },
    [client, load]
  )

  return {
    data,
    busy,
    notice,
    clearNotice: () => setNotice(null),
    refresh,
    reload: () => load(false),
    select: (accountId: string) => mutate('accounts.antigravitySelect', accountId),
    remove: (accountId: string) => mutate('accounts.antigravityRemove', accountId)
  }
}
