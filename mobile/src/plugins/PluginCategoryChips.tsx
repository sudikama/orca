import { Pressable, ScrollView, Text } from 'react-native'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, radii, spacing } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { pluginKindLabel } from './plugin-categories'

/** One kind at a time as a swipeable chip row; "All" (or tapping the active chip) clears it. */
export function PluginCategoryChips(props: {
  kinds: [string, number][]
  selected: string | null
  onSelect: (kind: string | null) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  if (props.kinds.length === 0) {
    return null
  }
  const chip = (key: string, label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={active ? styles.chipTextActive : styles.chipText}>{label}</Text>
    </Pressable>
  )
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroller}
    >
      {chip('all', t('plugins.kind.all', 'All'), props.selected === null, () =>
        props.onSelect(null)
      )}
      {props.kinds.map(([kind, count]) =>
        chip(kind, `${pluginKindLabel(kind, t)} ${count}`, props.selected === kind, () =>
          props.onSelect(props.selected === kind ? null : kind)
        )
      )}
    </ScrollView>
  )
}

const styles = themedStyleSheet(() => ({
  scroller: { flexGrow: 0, marginTop: spacing.md },
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.control,
    backgroundColor: colors.bgPanel
  },
  chipActive: { backgroundColor: colors.textPrimary },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { fontSize: 13, fontWeight: '600', color: colors.bgBase }
}))
