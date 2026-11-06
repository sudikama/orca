import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { formatWindowLabel } from '../../../../src/shared/rate-limit-window-label'
import { getUsageBarState, getWindowResetLabel, usageBarFill } from '../../components/AccountUsage'
import { ClaudeIcon, OpenAIIcon } from '../../components/AgentIcons'
import { MobileAgentIcon } from '../../components/MobileAgentIcon'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { colors, radii, spacing } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { HOME_EASE_OUT } from './home-tabs'
import type { HomeUsageCard } from './home-usage-cards'

export function UsageCard(props: {
  provider: string
  card: HomeUsageCard
  separated: boolean
  now: number
  reducedMotion: boolean
  onPress: () => void
}) {
  const t = useMobileTranslation()
  useMobileColorScheme()
  const [pressed, setPressed] = useState(false)
  const { card } = props
  const title = card.email ?? t('accounts.screen.default', 'System default')
  const subtitle =
    card.email == null
      ? (card.subtitle ?? t('accounts.screen.agentLogin', "Use the agent's own login"))
      : card.subtitle
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

const TILE_SIZE = 28
const METER_LABEL_WIDTH = 26
const METER_GAP = 10

const styles = themedStyleSheet(() => ({
  card: { paddingVertical: 14, paddingHorizontal: spacing.lg, backgroundColor: colors.bgPanel },
  cardSeparated: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  cardPressed: { backgroundColor: colors.bgRaised },
  head: { flexDirection: 'row', alignItems: 'center', gap: METER_GAP, marginBottom: 4 },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radii.tile,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, lineHeight: 22, color: colors.textPrimary },
  cardSubtitle: { fontSize: 13, lineHeight: 17, color: colors.textSecondary, marginTop: 1 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.skillTokenSurface
  },
  badgeText: { fontSize: 12, color: colors.accentBlue },
  meter: { flexDirection: 'row', alignItems: 'center', gap: METER_GAP, marginTop: 6 },
  meterLabel: { width: METER_LABEL_WIDTH, fontSize: 13, color: colors.textSecondary },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.translucentFill,
    overflow: 'hidden'
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radii.pill },
  meterValue: {
    width: 40,
    fontSize: 13,
    color: colors.textPrimary,
    textAlign: 'right',
    fontVariant: ['tabular-nums']
  },
  reset: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    marginLeft: METER_LABEL_WIDTH + METER_GAP
  }
}))
