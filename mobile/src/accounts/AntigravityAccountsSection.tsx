import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { getProviderDisplayName } from '../../../src/shared/usage-provider-windows'
import { ConfirmModal } from '../components/ConfirmModal'
import { MobileAgentIcon } from '../components/MobileAgentIcon'
import { ListGroup, ListRow, SectionHeader } from '../components/list/ListGroup'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-accounts-screen-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { RpcClient } from '../transport/rpc-client'
import { useAntigravityAccounts } from './add-account/use-antigravity-accounts'
import { ProviderUsageWindows } from './ProviderUsageWindows'

/** Antigravity on the Accounts screen like Codex: every saved account with its quota, tap one to switch. */
export function AntigravityAccountsSection(props: {
  client: RpcClient | null
  connected: boolean
  now: number
  /** Bumped by the screen's refresh so this section reads quota again too. */
  refreshToken: number
  /** Shown while the host has no saved accounts: the single login it reports. */
  fallback: ReactNode
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { data, busy, notice, clearNotice, refresh, select, remove } = useAntigravityAccounts(
    props.client,
    props.connected
  )
  const [switching, setSwitching] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ id: string; email: string } | null>(null)

  // The screen's refresh button reads quota again for every saved account.
  useEffect(() => {
    if (props.refreshToken > 0) {
      void refresh()
    }
  }, [props.refreshToken, refresh])

  const choose = useCallback(
    async (accountId: string) => {
      setSwitching(accountId)
      await select(accountId)
      setSwitching(null)
    },
    [select]
  )

  if (!data || data.state.accounts.length === 0) {
    return props.fallback
  }
  const blocked = busy || !props.connected
  return (
    <View>
      <SectionHeader
        title={getProviderDisplayName('antigravity')}
        icon={<MobileAgentIcon agentId="antigravity" size={14} />}
      />
      <ListGroup style={styles.group}>
        {data.state.accounts.map((account) => {
          const active = account.id === data.state.activeAccountId
          const usage = data.usage.find((entry) => entry.accountId === account.id)
          const limits = usage?.limits ?? null
          return (
            <ListRow
              key={account.id}
              title={account.email ?? t('accounts.antigravity.unknown', 'Unknown account')}
              detail={
                <>
                  <ProviderUsageWindows
                    limits={limits}
                    now={props.now}
                    isFetching={usage?.fetching === true || limits === null}
                    showEmptyWindows
                  />
                  {limits?.error ? (
                    <Text style={styles.errorText} numberOfLines={1}>
                      {limits.error}
                    </Text>
                  ) : null}
                </>
              }
              accessory={
                switching === account.id ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : undefined
              }
              selected={active}
              onPress={blocked || active ? undefined : () => void choose(account.id)}
              onLongPress={
                active
                  ? undefined
                  : () => setRemoving({ id: account.id, email: account.email ?? '' })
              }
            />
          )
        })}
      </ListGroup>
      <ConfirmModal
        visible={removing !== null}
        title={t('accounts.remove.title', 'Remove account?')}
        message={t(
          'accounts.remove.message',
          '{{email}} will be signed out of this host. You can add it again later.',
          { email: removing?.email ?? '' }
        )}
        confirmLabel={t('accounts.remove.confirm', 'Remove')}
        destructive
        onConfirm={() => {
          const target = removing
          setRemoving(null)
          if (target) {
            void remove(target.id)
          }
        }}
        onCancel={() => setRemoving(null)}
      />
      <ConfirmModal
        visible={notice !== null}
        title={t('accounts.screen.switchFailed', 'Could not switch account')}
        message={notice ?? undefined}
        confirmLabel={t('common.ok', 'OK')}
        cancelLabel={null}
        onCancel={clearNotice}
      />
    </View>
  )
}
