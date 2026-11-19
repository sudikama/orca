import { Text } from 'react-native'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { styles } from './mobile-plugins-styles'
import type { PluginPanelFrameProps } from './plugin-panel-bridge'

// Native screens have no shell frame to load; plugin panels run only in the host-served page.
export function PluginPanelFrame(_props: PluginPanelFrameProps) {
  const t = useMobileTranslation()
  return (
    <Text style={styles.hint}>
      {t('plugins.panel.pageOnly', 'Open the Plugins screen from the host to use its panels.')}
    </Text>
  )
}
