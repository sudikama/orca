import { useCallback, useState, type ReactNode } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { getProviderDisplayName } from '../../../src/shared/agent-usage/display/usage-provider-windows'
import { ConfirmModal } from '../components/sheets/ConfirmModal'
import { MobileAgentIcon } from '../components/icons/MobileAgentIcon'
import { ListGroup, ListRow, SectionHeader } from '../components/list/ListGroup'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { useAntigravityAccounts } from './add-account/use-antigravity-accounts'
import { styles } from './mobile-accounts-screen-styles'
import { ProviderUsageWindows } from './ProviderUsageWindows'

/** Antigravity on the Accounts screen like Codex: every saved account with its quota, tap one to switch. */
export function AntigravityAccountsSection(props: {
  client: RpcClient | null
  connected: boolean
  now: number
  /** The account stream's Antigravity reading time; a new one reads the saved list again. */
  usageUpdatedAt: number | null
  /** Shown while the host has no saved accounts: the single login it reports. */
  fallback: ReactNode
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { data, busy, notice, clearNotice, select, remove } = useAntigravityAccounts(
    props.client,
    props.connected,
    props.usageUpdatedAt
  )
  const [switching, setSwitching] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ id: string; email: string } | null>(null)

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
          const limits = data.usage.find((entry) => entry.accountId === account.id)?.limits ?? null
          return (
            <ListRow
              key={account.id}
              title={account.email ?? t('accounts.antigravity.unknown', 'Unknown account')}
              detail={
                <>
                  <ProviderUsageWindows limits={limits} now={props.now} showEmptyWindows />
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
