import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { LIST_ROW_PADDING } from '../components/list/ListGroup'

export const styles = themedStyleSheet(() => ({
  container: { flex: 1, backgroundColor: colors.bgBase },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  group: { backgroundColor: colors.bgPanel },
  hint: {
    fontSize: typography.metaSize,
    color: colors.textMuted,
    paddingHorizontal: LIST_ROW_PADDING,
    paddingVertical: spacing.md,
    lineHeight: 18
  },
  errorText: { fontSize: typography.metaSize, color: colors.statusRed },
  accessoryText: { fontSize: 15, color: colors.textSecondary },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingBottom: spacing.xs
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheetHeaderTitle: { flexShrink: 1, paddingBottom: 0 },
  sheetMeta: { fontSize: 13, color: colors.textMuted, paddingBottom: spacing.sm },
  sheetText: { fontSize: 14, color: colors.textSecondary, marginVertical: spacing.xs },
  bullet: { fontSize: 14, color: colors.textSecondary, paddingLeft: spacing.sm },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.control
  },
  buttonPrimary: { backgroundColor: colors.textPrimary },
  buttonDimmed: { opacity: 0.5 },
  buttonText: { fontSize: 15, color: colors.textPrimary },
  buttonDestructiveText: { fontSize: 15, color: colors.statusRed },
  buttonPrimaryText: { fontSize: 15, fontWeight: '600', color: colors.bgBase },
  logBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.surface,
    backgroundColor: colors.bgRaised
  },
  logLine: { fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' },
  panelBody: { flex: 1, minHeight: 0 },
  panelFrame: { flex: 1, minHeight: 0 }
}))
