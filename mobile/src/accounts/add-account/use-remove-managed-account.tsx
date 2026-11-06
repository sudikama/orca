import { useCallback, useState } from 'react'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import type { RpcClient } from '../../transport/rpc-client'

export type RemovableAccount = {
  provider: 'claude' | 'codex'
  accountId: string
  email: string
}

const REMOVE_METHODS = {
  claude: 'accounts.removeClaude',
  codex: 'accounts.removeCodex'
} as const

/** Removes one managed login on the host after a confirmation; the usage list refreshes from the account stream. */
export function useRemoveManagedAccount(client: RpcClient | null) {
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
      const res = await client.sendRequest(REMOVE_METHODS[account.provider], {
        accountId: account.accountId
      })
      if (!res.ok) {
        setNotice(res.error.message)
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }, [client, pending])

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
