import { Text, View } from 'react-native'
import { getProviderDisplayName } from '../../../src/shared/usage-provider-windows'
import type { ProviderRateLimits } from '../components/AccountUsage'
import { MobileAgentIcon } from '../components/MobileAgentIcon'
import { ListGroup, ListRow, SectionHeader } from '../components/list/ListGroup'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { styles } from './mobile-accounts-screen-styles'
import { ProviderUsageWindows } from './ProviderUsageWindows'

/** A usage-only provider (OpenCode Go, ...): its own section with the host's single signed-in login. */
export function OtherProviderUsage(props: { limits: ProviderRateLimits; now: number }) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { limits } = props
  return (
    <View>
      <SectionHeader
        title={getProviderDisplayName(limits.provider)}
        icon={<MobileAgentIcon agentId={limits.provider} size={14} />}
      />
      <ListGroup style={styles.group}>
        <ListRow
          key="default"
          title={t('accounts.screen.default', 'System default')}
          subtitle={t('accounts.screen.agentLogin', "Use the agent's own login")}
          detail={
            <>
              <ProviderUsageWindows limits={limits} now={props.now} />
              {limits.error ? (
                <Text style={styles.errorText} numberOfLines={1}>
                  {limits.error}
                </Text>
              ) : null}
            </>
          }
          selected
        />
      </ListGroup>
    </View>
  )
}
