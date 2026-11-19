import { Pressable, Text } from 'react-native'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { styles } from './mobile-plugins-styles'

export function PluginSheetButton(props: {
  label: string
  onPress: () => void
  primary?: boolean
  destructive?: boolean
  disabled?: boolean
}) {
  useMobileColorScheme()
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        props.primary && styles.buttonPrimary,
        (pressed || props.disabled) && styles.buttonDimmed
      ]}
    >
      <Text
        style={
          props.primary
            ? styles.buttonPrimaryText
            : props.destructive
              ? styles.buttonDestructiveText
              : styles.buttonText
        }
      >
        {props.label}
      </Text>
    </Pressable>
  )
}
