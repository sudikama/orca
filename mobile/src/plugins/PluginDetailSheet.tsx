import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { MobileSwitch } from '../components/controls/MobileSwitch'
import { ListGroup, ListRow, SectionHeader } from '../components/list/ListGroup'
import { ConfirmModal } from '../components/sheets/ConfirmModal'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { styles } from './mobile-plugins-styles'
import { isPluginEnabled, type PluginListEntry, type PluginLogLine } from './plugin-rpc-schemas'
import { PluginSheetButton } from './PluginSheetButton'
import type { HostPlugins } from './use-host-plugins'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { PluginGallery, PluginIcon } from './PluginGallery'

/** One installed plugin: on/off, its commands and panels, and its maintenance actions. */
export function PluginDetailSheet(props: {
  plugin: PluginListEntry | null
  client: RpcClient | null
  host: HostPlugins
  connected: boolean
  onOpenPanel: (panel: { id: string; title: string }) => void
  onClose: () => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { plugin, host } = props
  const [logs, setLogs] = useState<PluginLogLine[] | null>(null)
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const pluginKey = plugin?.pluginKey ?? null

  useEffect(() => {
    setLogs(null)
  }, [pluginKey])

  const busy = plugin !== null && host.busyKey === plugin.pluginKey
  const blocked = !props.connected || busy
  return (
    <BottomDrawer visible={plugin !== null} onClose={props.onClose} contentScrollable>
      {plugin ? (
        <View>
          <View style={styles.sheetHeader}>
            <PluginIcon client={props.client} images={plugin.images} size={40} />
            <Text style={[styles.sheetTitle, styles.sheetHeaderTitle]}>{plugin.name}</Text>
          </View>
          <Text style={styles.sheetMeta}>
            {plugin.publisher ? `${plugin.version} · ${plugin.publisher}` : plugin.version}
          </Text>
          <PluginGallery client={props.client} images={plugin.images} />
          {plugin.description ? <Text style={styles.sheetText}>{plugin.description}</Text> : null}
          {plugin.blockedByKillList ? (
            <Text style={styles.errorText}>{plugin.blockedByKillList.reason}</Text>
          ) : null}
          {plugin.error ? <Text style={styles.errorText}>{plugin.error}</Text> : null}
          <ListGroup style={styles.group}>
            <ListRow
              title={t('plugins.detail.enabled', 'Enabled')}
              subtitle={
                plugin.needsReconsent
                  ? t('plugins.detail.needsApproval', 'Asks for new access; turn on to review it.')
                  : undefined
              }
              accessory={
                <MobileSwitch
                  value={isPluginEnabled(plugin)}
                  disabled={blocked || plugin.blockedByKillList !== undefined}
                  onValueChange={(enabled) => void host.setEnabled(plugin.pluginKey, enabled)}
                  accessibilityLabel={t('plugins.detail.enabled', 'Enabled')}
                />
              }
            />
          </ListGroup>
          {plugin.commands.length > 0 ? (
            <>
              <SectionHeader title={t('plugins.detail.commands', 'Commands')} />
              <ListGroup style={styles.group}>
                {plugin.commands.map((command) => (
                  <ListRow
                    key={command.id}
                    title={command.title}
                    subtitle={
                      command.context === 'global'
                        ? undefined
                        : t('plugins.detail.workspaceCommand', 'Workspace command')
                    }
                    disabled={blocked || !isPluginEnabled(plugin)}
                    onPress={() =>
                      void host.runCommand(
                        plugin.pluginKey,
                        command.id,
                        t('plugins.detail.commandRan', '{{command}} ran.', {
                          command: command.title
                        })
                      )
                    }
                  />
                ))}
              </ListGroup>
            </>
          ) : null}
          {plugin.panels.length > 0 ? (
            <>
              <SectionHeader title={t('plugins.detail.panels', 'Panels')} />
              <ListGroup style={styles.group}>
                {plugin.panels.map((panel) => (
                  <ListRow
                    key={panel.id}
                    title={panel.title}
                    navigates
                    disabled={!props.connected || !isPluginEnabled(plugin)}
                    onPress={() => props.onOpenPanel(panel)}
                  />
                ))}
              </ListGroup>
            </>
          ) : null}
          <View style={styles.actions}>
            {plugin.hasWorker ? (
              <PluginSheetButton
                label={t('plugins.detail.restart', 'Restart')}
                disabled={blocked || !isPluginEnabled(plugin)}
                onPress={() => void host.restart(plugin.pluginKey)}
              />
            ) : null}
            {plugin.source?.kind === 'marketplace' ? (
              <PluginSheetButton
                label={t('plugins.detail.update', 'Update')}
                disabled={blocked}
                onPress={() => void host.update(plugin.pluginKey)}
              />
            ) : null}
            <PluginSheetButton
              label={t('plugins.detail.logs', 'Logs')}
              disabled={!props.connected}
              onPress={() => void host.readLogs(plugin.pluginKey).then(setLogs)}
            />
            <PluginSheetButton
              destructive
              label={t('plugins.detail.uninstall', 'Uninstall')}
              disabled={blocked}
              onPress={() => setConfirmUninstall(true)}
            />
          </View>
          {logs !== null ? (
            <View style={styles.logBox}>
              {logs.length === 0 ? (
                <Text style={styles.logLine}>
                  {t('plugins.detail.noLogs', 'No log lines yet.')}
                </Text>
              ) : (
                logs.slice(-200).map((line, index) => (
                  <Text key={`${line.ts}:${index}`} style={styles.logLine}>
                    {`${line.level.toUpperCase()} ${line.line}`}
                  </Text>
                ))
              )}
            </View>
          ) : null}
          <ConfirmModal
            visible={confirmUninstall}
            title={t('plugins.detail.uninstallTitle', 'Uninstall {{name}}?', { name: plugin.name })}
            message={t(
              'plugins.detail.uninstallMessage',
              'Its files and data are removed from this host.'
            )}
            confirmLabel={t('plugins.detail.uninstall', 'Uninstall')}
            destructive
            onConfirm={() => {
              setConfirmUninstall(false)
              props.onClose()
              void host.uninstall(plugin.pluginKey)
            }}
            onCancel={() => setConfirmUninstall(false)}
          />
        </View>
      ) : null}
    </BottomDrawer>
  )
}
