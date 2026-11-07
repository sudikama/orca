import { Gauge, RefreshCw } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { getProviderDisplayName } from '../../../../src/shared/usage-provider-windows'
import {
  useRemoveManagedAccount,
  type RemovableAccount
} from '../../accounts/add-account/use-remove-managed-account'
import { useAntigravityAccounts } from '../../accounts/add-account/use-antigravity-accounts'
import type { AccountsSnapshot, ProviderKey } from '../../components/AccountUsage'
import { useNow } from '../../hooks/use-now'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { useResponsiveLayout } from '../../layout/responsive-layout'
import { useReducedMotionEnabled } from '../../platform/use-reduced-motion'
import type { HomeStatsSummary } from '../../stats/home-stats-total'
import { colors, spacing } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { useHostClient } from '../../transport/host-client-hooks'
import type { ConnectionState, HostProfile } from '../../transport/types'
import { useHostDisplay } from '../../transport/use-host-display'
import { formatTimeAgo } from '../../worktree/agent-row-display'
import { homeListStyles } from '../home-list-styles'
import { MobileHomeSectionHeading } from '../MobileHomeSectionHeading'
import { MobileHomeStats } from '../MobileHomeStats'
import {
  selectHomeOtherUsageSections,
  selectHomeUsageSections,
  type HomeUsageCard
} from './home-usage-cards'
import { selectAntigravityCards } from './antigravity-usage-cards'
import { UsageCard } from './MobileHomeUsageCard'
import { MobileHomeHostPill, useHomeTabHost } from './MobileHomeHostPill'
import { MobileHomeTabHeader, MobileHomeTabHeaderButton } from './MobileHomeTabHeader'
import { UsageAddAccountButton } from './UsageAddAccountButton'

const PROVIDER_TITLES: Record<ProviderKey, string> = { claude: 'Claude Code', codex: 'Codex' }

/** System default has no managed login to remove, so only cards with an id and email qualify. */
function removableAccount(provider: ProviderKey, card: HomeUsageCard): RemovableAccount | null {
  return card.accountId !== null && card.email !== null
    ? { provider, accountId: card.accountId, email: card.email }
    : null
}

/** Usage: agent account quota on one desktop, after the totals across all of them. */
export function MobileHomeUsageTab(props: {
  hosts: readonly HostProfile[]
  connectedHosts: readonly HostProfile[]
  hostStates: Record<string, ConnectionState>
  accountsByHost: Record<string, AccountsSnapshot>
  stats: HomeStatsSummary | null
  bottomInset: number
  onOpenAccounts: (hostId: string) => void
}) {
  const t = useMobileTranslation()
  useMobileColorScheme()
  const { isWideLayout, contentMaxWidth } = useResponsiveLayout()
  const { host, pick } = useHomeTabHost(props.hosts, props.connectedHosts)
  const { client } = useHostClient(host?.id)
  const connected = host != null && props.hostStates[host.id] === 'connected'
  const [refreshingHostId, setRefreshingHostId] = useState<string | null>(null)
  const refreshing = host != null && refreshingHostId === host.id
  const antigravity = useAntigravityAccounts(client, connected)
  const { requestRemove, dialogs } = useRemoveManagedAccount(client, antigravity.reload)
  const antigravityCards =
    antigravity.data && antigravity.data.state.accounts.length > 0
      ? selectAntigravityCards(antigravity.data)
      : []

  // Why: the host pushes the refreshed usage over accounts.subscribe too, so the reply goes unread.
  const refresh = useCallback(async () => {
    if (!client || !host || refreshing) {
      return
    }
    setRefreshingHostId(host.id)
    try {
      await Promise.all([
        client.sendRequest('accounts.list', { refreshUsage: true }),
        antigravity.refresh()
      ])
    } catch {
      // A failed refresh leaves the streamed usage on screen.
    } finally {
      setRefreshingHostId((current) => (current === host.id ? null : current))
    }
  }, [antigravity, client, host, refreshing])

  return (
    <View style={styles.screen}>
      <MobileHomeTabHeader
        title={t('home.tabs.usage', 'Usage')}
        trailing={
          host ? (
            <MobileHomeTabHeaderButton
              icon={RefreshCw}
              spinning={refreshing}
              disabled={!connected || !client}
              accessibilityLabel={t('home.usage.refresh', 'Refresh usage')}
              onPress={() => void refresh()}
            />
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xl + props.bottomInset },
          isWideLayout && { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }
        ]}
      >
        {host ? (
          <MobileHomeHostPill
            hosts={props.hosts}
            host={host}
            state={props.hostStates[host.id]}
            pickerTitle={t('home.usage.showUsageFor', 'Show usage for')}
            onPick={pick}
          />
        ) : null}
        {props.stats ? <MobileHomeStats stats={props.stats} first /> : null}
        {host ? (
          <HostUsage
            host={host}
            connected={connected}
            snapshot={props.accountsByHost[host.id] ?? null}
            first={!props.stats}
            antigravityCards={antigravityCards}
            onOpenAccounts={props.onOpenAccounts}
            onRemoveAccount={requestRemove}
          />
        ) : (
          <UsageEmpty
            message={t('home.usage.pairDesktop', 'Pair a desktop to see agent account usage.')}
          />
        )}
      </ScrollView>
      <UsageAddAccountButton
        client={client}
        connected={connected}
        bottomInset={props.bottomInset}
        onClosed={antigravity.reload}
      />
      {dialogs}
    </View>
  )
}

function HostUsage(props: {
  host: HostProfile
  connected: boolean
  snapshot: AccountsSnapshot | null
  first: boolean
  antigravityCards: readonly HomeUsageCard[]
  onOpenAccounts: (hostId: string) => void
  onRemoveAccount: (account: RemovableAccount) => void
}) {
  const t = useMobileTranslation()
  useMobileColorScheme()
  const reducedMotion = useReducedMotionEnabled() === true
  const desktop = useHostDisplay(props.host).title
  // Why: the reset countdowns and "Updated" note only flip on minute boundaries.
  const now = useNow(60_000, props.connected)
  // The tab's first desktop appears in place; only a switch to another one fades in.
  const [initialHostId] = useState(props.host.id)

  if (!props.connected) {
    return (
      <UsageEmpty
        message={t('home.usage.connectDesktop', 'Connect {{desktop}} to see agent account usage.', {
          desktop
        })}
      />
    )
  }
  if (!props.snapshot) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
      </View>
    )
  }
  const sections = selectHomeUsageSections(props.snapshot)
  const hasAntigravityAccounts = props.antigravityCards.length > 0
  // With saved accounts, Antigravity gets a card per account instead of the host's single login.
  const otherSections = selectHomeOtherUsageSections(props.snapshot).filter(
    (section) => !(hasAntigravityAccounts && section.provider === 'antigravity')
  )
  if (sections.length === 0 && otherSections.length === 0 && !hasAntigravityAccounts) {
    return (
      <UsageEmpty
        message={t('home.usage.addAccounts', 'Add accounts from desktop Settings → Accounts.')}
      />
    )
  }
  return (
    <Animated.View
      key={props.host.id}
      entering={reducedMotion || props.host.id === initialHostId ? undefined : FadeIn.duration(180)}
    >
      {sections.map((section, index) => (
        <View key={section.provider}>
          <MobileHomeSectionHeading
            title={PROVIDER_TITLES[section.provider]}
            first={props.first && index === 0}
            aside={
              section.updatedAt == null
                ? undefined
                : now - section.updatedAt < 60_000
                  ? t('home.usage.updatedJustNow', 'Updated just now')
                  : t('home.usage.updatedAgo', 'Updated {{time}} ago', {
                      time: formatTimeAgo(section.updatedAt, now)
                    })
            }
          />
          <View style={homeListStyles.group}>
            {section.cards.map((card, cardIndex) => {
              const removable = removableAccount(section.provider, card)
              return (
                <UsageCard
                  key={card.accountId ?? 'default'}
                  provider={section.provider}
                  card={card}
                  separated={cardIndex > 0}
                  now={now}
                  reducedMotion={reducedMotion}
                  onPress={() => props.onOpenAccounts(props.host.id)}
                  onLongPress={removable ? () => props.onRemoveAccount(removable) : undefined}
                />
              )
            })}
          </View>
        </View>
      ))}
      {hasAntigravityAccounts ? (
        <View>
          <MobileHomeSectionHeading
            title={getProviderDisplayName('antigravity')}
            first={props.first && sections.length === 0}
          />
          <View style={homeListStyles.group}>
            {props.antigravityCards.map((card, cardIndex) => (
              <UsageCard
                key={card.accountId ?? 'default'}
                provider="antigravity"
                card={card}
                separated={cardIndex > 0}
                now={now}
                reducedMotion={reducedMotion}
                onPress={() => props.onOpenAccounts(props.host.id)}
                onLongPress={
                  card.accountId !== null && card.email !== null && !card.active
                    ? () =>
                        props.onRemoveAccount({
                          provider: 'antigravity',
                          accountId: card.accountId ?? '',
                          email: card.email ?? ''
                        })
                    : undefined
                }
              />
            ))}
          </View>
        </View>
      ) : null}
      {otherSections.map((section, index) => (
        <View key={section.provider}>
          <MobileHomeSectionHeading
            title={getProviderDisplayName(section.provider)}
            first={props.first && sections.length === 0 && !hasAntigravityAccounts && index === 0}
            aside={
              section.updatedAt == null
                ? undefined
                : now - section.updatedAt < 60_000
                  ? t('home.usage.updatedJustNow', 'Updated just now')
                  : t('home.usage.updatedAgo', 'Updated {{time}} ago', {
                      time: formatTimeAgo(section.updatedAt, now)
                    })
            }
          />
          <View style={homeListStyles.group}>
            <UsageCard
              provider={section.provider}
              card={section.card}
              separated={false}
              now={now}
              reducedMotion={reducedMotion}
              onPress={() => props.onOpenAccounts(props.host.id)}
            />
          </View>
        </View>
      ))}
    </Animated.View>
  )
}

function UsageEmpty(props: { message: string }) {
  const t = useMobileTranslation()
  useMobileColorScheme()
  return (
    <View style={styles.empty}>
      <Gauge size={28} color={colors.textMuted} />
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {t('home.usage.emptyTitle', 'No usage yet')}
      </Text>
      <Text style={styles.emptyBody}>{props.message}</Text>
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg },
  loading: { alignItems: 'center', paddingVertical: 60 },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 28,
    marginTop: 32
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs
  },
  emptyBody: { fontSize: 15, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' }
}))
