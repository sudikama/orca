import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import {
  HOST_ACCOUNT_SIGN_IN_SETTLED_PHASES,
  type HostAccountSignInProvider,
  type HostAccountSignInStatus
} from '../../../../src/shared/host-account-sign-in-types'
import type { RpcClient } from '../../transport/rpc-client'

export type HostSignInView =
  | { kind: 'idle' }
  | { kind: 'starting'; provider: HostAccountSignInProvider }
  | { kind: 'active'; status: HostAccountSignInStatus; submittingCode: boolean }
  | { kind: 'error'; message: string }

// The host long-polls for 20 s; leave headroom so a quiet poll never reads as a failure.
const WAIT_TIMEOUT_MS = 35_000

// Only the fields the sheet reads; account snapshots on the status stay on the host's own stream.
const HostSignInStatusSchema = z.object({
  flowId: z.string(),
  provider: z.enum(['claude', 'codex']),
  revision: z.number(),
  phase: z.enum(['starting', 'waiting', 'verifying', 'signedIn', 'failed', 'cancelled']),
  prompt: z
    .object({
      url: z.string(),
      userCode: z.string().nullable().default(null),
      needsCode: z.boolean().default(false)
    })
    .optional(),
  error: z.string().optional(),
  errorCode: z.string().optional()
})

function decodeStatus(value: unknown): HostAccountSignInStatus | null {
  const parsed = HostSignInStatusSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function isSignInSettled(status: HostAccountSignInStatus): boolean {
  return HOST_ACCOUNT_SIGN_IN_SETTLED_PHASES.has(status.phase)
}

/** Drives a sign-in that runs on the host: it starts there, we open its page and relay the code back. */
export function useHostSignIn(client: RpcClient | null) {
  const [view, setView] = useState<HostSignInView>({ kind: 'idle' })
  // A new run or a close bumps this so a late reply from an old flow cannot repaint the sheet.
  const runRef = useRef(0)
  const flowRef = useRef<{ id: string; settled: boolean } | null>(null)

  const cancelActiveFlow = useCallback(() => {
    const flow = flowRef.current
    flowRef.current = null
    if (client && flow && !flow.settled) {
      void client.sendRequest('accounts.hostSignInCancel', { flowId: flow.id }).catch(() => {})
    }
  }, [client])

  const reset = useCallback(() => {
    runRef.current += 1
    cancelActiveFlow()
    setView({ kind: 'idle' })
  }, [cancelActiveFlow])

  const start = useCallback(
    async (provider: HostAccountSignInProvider) => {
      if (!client) {
        return
      }
      const run = ++runRef.current
      cancelActiveFlow()
      setView({ kind: 'starting', provider })
      try {
        const first = await client.sendRequest('accounts.hostSignInStart', { provider })
        if (run !== runRef.current) {
          return
        }
        let status = first.ok ? decodeStatus(first.result) : null
        if (!status) {
          setView({
            kind: 'error',
            message: first.ok ? 'The host sent an unreadable sign-in reply.' : first.error.message
          })
          return
        }
        flowRef.current = { id: status.flowId, settled: false }
        setView({ kind: 'active', status, submittingCode: false })
        while (!isSignInSettled(status)) {
          const next = await client.sendRequest(
            'accounts.hostSignInWait',
            { flowId: status.flowId, afterRevision: status.revision },
            { timeoutMs: WAIT_TIMEOUT_MS }
          )
          if (run !== runRef.current) {
            return
          }
          const decoded = next.ok ? decodeStatus(next.result) : null
          if (!decoded) {
            setView({
              kind: 'error',
              message: next.ok ? 'The host sent an unreadable sign-in reply.' : next.error.message
            })
            return
          }
          status = decoded
          setView((current) => ({
            kind: 'active',
            status: decoded,
            submittingCode: current.kind === 'active' ? current.submittingCode : false
          }))
        }
        flowRef.current = { id: status.flowId, settled: true }
      } catch (error) {
        if (run === runRef.current) {
          setView({
            kind: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
    },
    [cancelActiveFlow, client]
  )

  const submitCode = useCallback(
    async (code: string) => {
      const flow = flowRef.current
      if (!client || !flow) {
        return
      }
      setView((current) =>
        current.kind === 'active' ? { ...current, submittingCode: true } : current
      )
      try {
        const res = await client.sendRequest('accounts.hostSignInSubmitCode', {
          flowId: flow.id,
          code
        })
        if (!res.ok) {
          setView({ kind: 'error', message: res.error.message })
        }
      } catch (error) {
        setView({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    },
    [client]
  )

  // Closing the screen mid-flow must not leave a login holding the host's account queue.
  useEffect(() => cancelActiveFlow, [cancelActiveFlow])

  return { view, start, submitCode, reset }
}
