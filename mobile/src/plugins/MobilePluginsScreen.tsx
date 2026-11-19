import { useState } from 'react'
import { ScrollView, Text } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { ChevronLeft, RefreshCw } from 'lucide-react-native'
import { NavBar } from '../components/nav-bar/NavBar'
import { NavBarButton } from '../components/nav-bar/NavBarButton'
import { MobileSwitch } from '../components/controls/MobileSwitch'
import { ListGroup, ListRow, SectionHeader } from '../components/list/ListGroup'
import { ConfirmModal } from '../components/sheets/ConfirmModal'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useRouteHandoff } from '../navigation/route-handoff'
import { spacing } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useHostClient } from '../transport/connection/host-client-hooks'
import { styles } from './mobile-plugins-styles'
import { PluginApprovalSheet } from './PluginApprovalSheet'
import { PluginDetailSheet } from './PluginDetailSheet'
import { isPluginEnabled, type PluginListEntry } from './plugin-rpc-schemas'
import { useHostPlugins } from './use-host-plugins'

type Translate = ReturnType<typeof useMobileTranslation>

function statusLabel(t: Translate, plugin: PluginListEntry): string {
  switch (plugin.status) {
    case 'running':
      return t('plugins.status.running', 'Running')
    case 'idle':
      return t('plugins.status.idle', 'On')
    case 'restarting':
      return t('plugins.status.restarting', 'Restarting')
    case 'pending':
      return t('plugins.status.pending', 'Needs approval')
    case 'disabled':
      return t('plugins.status.disabled', 'Off')
    case 'errored':
      return t('plugins.status.errored', 'Error')
    case 'invalid':
      return t('plugins.status.invalid', 'Invalid')
    default:
      return plugin.status
  }
}

/** The host's Orca plugins: run them on the headless host and manage them from the phone. */
export function MobilePluginsScreen() {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const router = useRouteHandoff()
  const insets = useSafeAreaInsets()
  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  // Why: shared client per host. See docs/mobile-shared-client-per-host.md.
  const { client, state: connState } = useHostClient(hostId)
  const connected = connState === 'connected'
  const host = useHostPlugins(client, connected)
  const [detailKey, setDetailKey] = useState<string | null>(null)

  const installed = host.plugins ?? []
  const installedKeys = new Set(installed.map((plugin) => plugin.pluginKey))
  const available = host.listings.filter((listing) => !installedKeys.has(listing.pluginKey))
  const detail = installed.find((plugin) => plugin.pluginKey === detailKey) ?? null

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <NavBar
        leading={
          <NavBarButton
            icon={ChevronLeft}
            onPress={() => router.back()}
            accessibilityLabel={t('common.back', 'Back')}
          />
        }
        title={t('plugins.screen.title', 'Plugins')}
        refreshing={host.loading}
        trailing={
          <NavBarButton
            icon={RefreshCw}
            onPress={() => void host.reload()}
            disabled={!connected || host.loading}
            accessibilityLabel={t('plugins.screen.refresh', 'Refresh plugins')}
          />
        }
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {!connected ? (
          <Text style={styles.hint}>
            {t('plugins.screen.offline', 'Connect to this host to manage its plugins.')}
          </Text>
        ) : null}
        <ListGroup style={styles.group}>
          <ListRow
            title={t('plugins.screen.system', 'Plugins on this host')}
            subtitle={t('plugins.screen.systemHint', 'Lets installed plugins run on the host.')}
            accessory={
              <MobileSwitch
                value={host.systemEnabled === true}
                disabled={!connected || host.systemEnabled === null || host.busyKey !== null}
                onValueChange={(enabled) => void host.setSystemEnabled(enabled)}
                accessibilityLabel={t('plugins.screen.system', 'Plugins on this host')}
              />
            }
          />
        </ListGroup>
        {host.systemEnabled ? (
          <>
            <SectionHeader title={t('plugins.screen.installed', 'Installed')} />
            {installed.length === 0 ? (
              <Text style={styles.hint}>
                {t('plugins.screen.none', 'No plugins installed yet.')}
              </Text>
            ) : (
              <ListGroup style={styles.group}>
                {installed.map((plugin) => (
                  <ListRow
                    key={plugin.pluginKey}
                    title={plugin.name}
                    subtitle={`${plugin.version} · ${statusLabel(t, plugin)}`}
                    selected={isPluginEnabled(plugin)}
                    busy={host.busyKey === plugin.pluginKey}
                    navigates
                    onPress={() => setDetailKey(plugin.pluginKey)}
                  />
                ))}
              </ListGroup>
            )}
            <SectionHeader title={t('plugins.screen.marketplace', 'Marketplace')} />
            {available.length === 0 ? (
              <Text style={styles.hint}>
                {t('plugins.screen.noListings', 'Nothing new to install right now.')}
              </Text>
            ) : (
              <ListGroup style={styles.group}>
                {available.map((listing) => (
                  <ListRow
                    key={listing.pluginKey}
                    title={listing.name ?? listing.pluginKey}
                    subtitle={listing.description}
                    accessory={
                      <Text style={styles.accessoryText}>
                        {listing.blocked
                          ? t('plugins.screen.blocked', 'Blocked')
                          : t('plugins.screen.install', 'Install')}
                      </Text>
                    }
                    busy={host.busyKey === listing.pluginKey}
                    disabled={!connected || listing.blocked || host.busyKey !== null}
                    onPress={() => void host.install(listing.pluginKey)}
                  />
                ))}
              </ListGroup>
            )}
          </>
        ) : null}
      </ScrollView>
      <PluginDetailSheet
        plugin={detail}
        host={host}
        connected={connected}
        onClose={() => setDetailKey(null)}
      />
      <PluginApprovalSheet
        request={host.approval}
        onApprove={() => void host.approve()}
        onCancel={host.dismissApproval}
      />
      <ConfirmModal
        visible={host.notice !== null}
        title={t('plugins.screen.title', 'Plugins')}
        message={host.notice ?? undefined}
        confirmLabel={t('common.ok', 'OK')}
        cancelLabel={null}
        onCancel={host.clearNotice}
      />
    </SafeAreaView>
  )
}
