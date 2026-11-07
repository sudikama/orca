import { Plus } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable } from 'react-native'
import { AddAccountSheet } from '../../accounts/add-account/AddAccountSheet'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { colors, spacing } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import type { RpcClient } from '../../transport/rpc-client'

const BUTTON_SIZE = 56

/** Floating "+" over the Usage list; opens the add-account sheet for the host on screen. */
export function UsageAddAccountButton(props: {
  client: RpcClient | null
  connected: boolean
  bottomInset: number
  /** The sheet closed; an account may have been added, so the lists should read again. */
  onClosed?: () => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const [open, setOpen] = useState(false)
  if (!props.connected || !props.client) {
    return null
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('accounts.add.title', 'Add account')}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          { bottom: spacing.lg + props.bottomInset },
          pressed && styles.pressed
        ]}
      >
        <Plus size={26} color={colors.bgBase} />
      </Pressable>
      <AddAccountSheet visible={open} client={props.client} onClose={() => {
          setOpen(false)
          props.onClosed?.()
        }}
      />
    </>
  )
}

const styles = themedStyleSheet(() => ({
  button: {
    position: 'absolute',
    right: spacing.lg,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }
  },
  pressed: { opacity: 0.8 }
}))
