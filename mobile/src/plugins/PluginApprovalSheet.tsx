import { Text, View } from 'react-native'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { styles } from './mobile-plugins-styles'
import type { PluginApprovalRequest } from './plugin-rpc-schemas'
import { PluginSheetButton } from './PluginSheetButton'

/** The access a plugin asks for before it can run; the host binds the approval to exactly this. */
export function PluginApprovalSheet(props: {
  request: PluginApprovalRequest | null
  onApprove: () => void
  onCancel: () => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const request = props.request
  return (
    <BottomDrawer visible={request !== null} onClose={props.onCancel}>
      {request ? (
        <View>
          <Text style={styles.sheetTitle}>
            {t('plugins.approval.title', 'Allow {{name}}?', { name: request.name })}
          </Text>
          <Text style={styles.sheetMeta}>{request.version}</Text>
          {request.grants.executionDescription ? (
            <Text style={styles.sheetText}>{request.grants.executionDescription}</Text>
          ) : null}
          {request.grants.capabilities.map((capability) => (
            <Text key={capability.description} style={styles.bullet}>
              {`• ${capability.description}`}
            </Text>
          ))}
          {request.why ? <Text style={styles.sheetText}>{request.why}</Text> : null}
          <View style={styles.actions}>
            <PluginSheetButton label={t('common.cancel', 'Cancel')} onPress={props.onCancel} />
            <PluginSheetButton
              primary
              label={t('plugins.approval.allow', 'Allow')}
              onPress={props.onApprove}
            />
          </View>
        </View>
      ) : null}
    </BottomDrawer>
  )
}
