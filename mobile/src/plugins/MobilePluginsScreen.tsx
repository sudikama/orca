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
import { MarketplaceDetailSheet } from './MarketplaceDetailSheet'
import { PluginCategoryChips } from './PluginCategoryChips'
import { pluginKindCounts, pluginKinds } from './plugin-categories'
import { PluginPanelSheet, type OpenPluginPanel } from './PluginPanelSheet'
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
  const [openPanel, setOpenPanel] = useState<OpenPluginPanel | null>(null)
  const [marketKey, setMarketKey] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(null)

  const allInstalled = host.plugins ?? []
  const installedKeys = new Set(allInstalled.map((plugin) => plugin.pluginKey))
  const allAvailable = host.listings.filter((listing) => !installedKeys.has(listing.pluginKey))
  // Fork: kinds as on desktop; an installed plugin takes its listing's categories, else its types.
  const categoriesByKey = new Map(host.listings.map((l) => [l.pluginKey, l.categories]))
  const installedKinds = allInstalled.map((p) =>
    pluginKinds(categoriesByKey.get(p.pluginKey) ?? [], p.types)
  )
  const availableKinds = allAvailable.map((listing) => pluginKinds(listing.categories))
  const kindCounts = pluginKindCounts([...installedKinds, ...availableKinds])
  const installed = allInstalled.filter((_, i) => kind === null || installedKinds[i].includes(kind))
  const available = allAvailable.filter((_, i) => kind === null || availableKinds[i].includes(kind))
  const detail = allInstalled.find((plugin) => plugin.pluginKey === detailKey) ?? null
  const market = allAvailable.find((listing) => listing.pluginKey === marketKey) ?? null

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
            <PluginCategoryChips kinds={kindCounts} selected={kind} onSelect={setKind} />
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
                    navigates
                    onPress={() => setMarketKey(listing.pluginKey)}
                  />
                ))}
              </ListGroup>
            )}
          </>
        ) : null}
      </ScrollView>
      <MarketplaceDetailSheet
        listing={market}
        client={client}
        busy={market !== null && host.busyKey === market.pluginKey}
        installDisabled={!connected || host.busyKey !== null}
        onInstall={(pluginKey) => {
          setMarketKey(null)
          void host.install(pluginKey)
        }}
        onClose={() => setMarketKey(null)}
      />
      <PluginDetailSheet
        plugin={detail}
        client={client}
        host={host}
        connected={connected}
        onOpenPanel={(panel) => {
          if (detail) {
            setOpenPanel({ pluginKey: detail.pluginKey, panelId: panel.id, title: panel.title })
            setDetailKey(null)
          }
        }}
        onClose={() => setDetailKey(null)}
      />
      <PluginPanelSheet client={client} panel={openPanel} onClose={() => setOpenPanel(null)} />
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
