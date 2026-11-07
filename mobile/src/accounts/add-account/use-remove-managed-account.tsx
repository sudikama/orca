import { useCallback, useState } from 'react'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import type { RpcClient } from '../../transport/rpc-client'

export type RemovableAccount = {
  provider: 'claude' | 'codex' | 'antigravity'
  accountId: string
  email: string
}

function removeRequest(account: RemovableAccount): { method: string; params: object } {
  if (account.provider === 'antigravity') {
    return {
      method: 'accounts.antigravityRemove',
      params: { target: { runtime: 'host' }, accountId: account.accountId }
    }
  }
  return {
    method: account.provider === 'claude' ? 'accounts.removeClaude' : 'accounts.removeCodex',
    params: { accountId: account.accountId }
  }
}

/** Removes one managed login on the host after a confirmation; the usage list refreshes from the account stream. */
export function useRemoveManagedAccount(client: RpcClient | null, onRemoved?: () => void) {
  const t = useMobileTranslation()
  const [pending, setPending] = useState<RemovableAccount | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const confirmRemove = useCallback(async () => {
    const account = pending
    setPending(null)
    if (!client || !account) {
      return
    }
    try {
      const { method, params } = removeRequest(account)
      const res = await client.sendRequest(method, params)
      if (!res.ok) {
        setNotice(res.error.message)
      } else {
        onRemoved?.()
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }, [client, onRemoved, pending])

  const dialogs = (
    <>
      <ConfirmModal
        visible={pending !== null}
        title={t('accounts.remove.title', 'Remove account?')}
        message={t(
          'accounts.remove.message',
          '{{email}} will be signed out of this host. You can add it again later.',
          { email: pending?.email ?? '' }
        )}
        confirmLabel={t('accounts.remove.confirm', 'Remove')}
        destructive
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPending(null)}
      />
      <ConfirmModal
        visible={notice !== null}
        title={t('accounts.remove.failed', 'Could not remove account')}
        message={notice ?? undefined}
        confirmLabel={t('common.ok', 'OK')}
        cancelLabel={null}
        onCancel={() => setNotice(null)}
      />
    </>
  )

  return { requestRemove: setPending, dialogs }
}
