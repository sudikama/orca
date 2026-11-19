import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { usageBarFill } from '../../accounts/usage/UsageBar'
import { getUsageBarState, getWindowResetLabel } from '../../accounts/usage/usage-selectors'
import { ClaudeIcon, OpenAIIcon } from '../../components/icons/AgentIcons'
import { MobileAgentIcon } from '../../components/icons/MobileAgentIcon'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { colors } from '../../theme/mobile-theme'
import '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { formatWindowLabel } from '../../../../src/shared/agent-usage/rate-limits/rate-limit-window-label'
import { getManagedAccountPrimaryLabel } from '../../../../src/shared/agent-accounts/managed-account-display-names'
import { HOME_EASE_OUT } from './home-tabs'
import type { HomeUsageCard } from './home-usage-cards'
import { mobileHomeUsageStyles as styles } from './mobile-home-usage-styles'

export function UsageCard(props: {
  provider: string
  card: HomeUsageCard
  separated: boolean
  now: number
  reducedMotion: boolean
  onPress: () => void
  /** Only managed accounts offer it; the System default login has nothing to remove. */
  onLongPress?: () => void
}) {
  const t = useMobileTranslation()
  useMobileColorScheme()
  const [pressed, setPressed] = useState(false)
  const { card } = props
  const title =
    card.email == null
      ? t('accounts.screen.default', 'System default')
      : getManagedAccountPrimaryLabel({ email: card.email, displayName: card.displayName })
  // A named card keeps its email on the second line, as desktop rows do.
  const subtitle =
    card.email == null
      ? (card.subtitle ?? t('accounts.screen.agentLogin', "Use the agent's own login"))
      : title === card.email
        ? card.subtitle
        : [card.email, card.subtitle].filter(Boolean).join(' · ')
  const windows: { key: 'session' | 'weekly' | 'monthly'; label: string }[] = [
    { key: 'session', label: t('accounts.screen.sessionWindow', '5h') },
    { key: 'weekly', label: t('accounts.screen.weeklyWindow', '7d') }
  ]
  const monthly = card.limits?.monthly
  if (monthly) {
    windows.push({ key: 'monthly', label: formatWindowLabel(monthly.windowMinutes) })
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, card.active ? t('home.usage.active', 'Active') : null]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={t('home.usage.openAccountsHint', 'Opens this desktop’s accounts')}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
    >
      <Animated.View
        style={[
          styles.card,
          props.separated && styles.cardSeparated,
          pressed && styles.cardPressed,
          {
            transform: [{ scale: pressed && !props.reducedMotion ? 0.98 : 1 }],
            transitionProperty: ['transform', 'backgroundColor'],
            transitionDuration: 120
          }
        ]}
      >
        <View style={styles.head}>
          <View style={styles.tile}>
            {props.provider === 'claude' ? (
              <ClaudeIcon size={16} />
            ) : props.provider === 'codex' ? (
              <OpenAIIcon size={16} color={colors.textPrimary} />
            ) : (
              <MobileAgentIcon agentId={props.provider} size={16} />
            )}
          </View>
          <View style={styles.headText}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {card.active ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('home.usage.active', 'Active')}</Text>
            </View>
          ) : null}
        </View>
        {card.metered
          ? windows.map((window) => (
              <UsageMeter
                key={window.key}
                label={window.label}
                card={card}
                windowKey={window.key}
                now={props.now}
                reducedMotion={props.reducedMotion}
              />
            ))
          : null}
      </Animated.View>
    </Pressable>
  )
}

function UsageMeter(props: {
  label: string
  card: HomeUsageCard
  windowKey: 'session' | 'weekly' | 'monthly'
  now: number
  reducedMotion: boolean
}) {
  useMobileColorScheme()
  const usageWindow = props.card.limits?.[props.windowKey] ?? null
  const bar = getUsageBarState(props.card.limits, usageWindow, props.card.fetching)
  const { used, color } = usageBarFill(bar.usedPercent, bar.unavailable)
  const reset = getWindowResetLabel(usageWindow, props.now)
  const width = useSharedValue(props.reducedMotion ? (used ?? 0) : 0)

  useEffect(() => {
    width.value = props.reducedMotion
      ? (used ?? 0)
      : withTiming(used ?? 0, { duration: 450, easing: HOME_EASE_OUT })
  }, [props.reducedMotion, used, width])

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }))
  const value = bar.unavailable || used == null ? '—' : `${used}%`

  return (
    <>
      <View
        style={styles.meter}
        accessible
        accessibilityLabel={[props.label, value, reset].filter(Boolean).join(', ')}
      >
        <Text style={styles.meterLabel}>{props.label}</Text>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
        </View>
        {bar.loading ? (
          <ActivityIndicator size="small" color={colors.textSecondary} style={styles.meterValue} />
        ) : (
          <Text style={styles.meterValue}>{value}</Text>
        )}
      </View>
      {reset ? (
        <Text style={styles.reset} numberOfLines={1}>
          {reset}
        </Text>
      ) : null}
    </>
  )
}
