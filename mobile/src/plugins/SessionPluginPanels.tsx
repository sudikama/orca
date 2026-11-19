import { useEffect, useState } from 'react'
import { Puzzle, Settings2 } from 'lucide-react-native'
import { ActionSheetModal, type ActionSheetAction } from '../components/sheets/ActionSheetModal'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { isPluginEnabled, PluginListSchema, type PluginListEntry } from './plugin-rpc-schemas'
import { PluginPanelSheet, type OpenPluginPanel } from './PluginPanelSheet'
import { PluginIcon } from './PluginGallery'

/** The session menu's Plugins action: each enabled plugin's panels, opened in place. */
export function SessionPluginPanels(props: {
  client: RpcClient | null
  visible: boolean
  onClose: () => void
  onManage: () => void
}) {
  const t = useMobileTranslation()
  const [plugins, setPlugins] = useState<PluginListEntry[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [openPanel, setOpenPanel] = useState<OpenPluginPanel | null>(null)
  const { client, visible } = props

  useEffect(() => {
    if (!visible || !client) {
      return
    }
    let cancelled = false
    setMessage(null)
    void client.sendRequest('plugins.list').then(
      (res) => {
        if (cancelled) {
          return
        }
        if (!res.ok) {
          setMessage(res.error.message)
          return
        }
        const parsed = PluginListSchema.safeParse(res.result)
        setPlugins(parsed.success ? parsed.data : [])
      },
      (error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [client, visible])

  const panels = (plugins ?? [])
    .filter(isPluginEnabled)
    .flatMap((plugin) => plugin.panels.map((panel) => ({ plugin, panel })))
  const actions: ActionSheetAction[] = [
    ...panels.map(({ plugin, panel }) => ({
      id: `${plugin.pluginKey}:${panel.id}`,
      label: plugin.name,
      ...(panel.title === plugin.name ? {} : { hint: panel.title }),
      icon: Puzzle,
      renderIcon: () => <PluginIcon client={client} images={plugin.images} size={20} />,
      // The panel sheet opens once this list has slid away.
      closeBeforePress: true,
      onPress: () =>
        setOpenPanel({ pluginKey: plugin.pluginKey, panelId: panel.id, title: panel.title })
    })),
    {
      id: 'manage',
      label: t('plugins.session.manage', 'Manage plugins'),
      icon: Settings2,
      closeBeforePress: true,
      onPress: props.onManage
    }
  ]
  const empty = plugins !== null && panels.length === 0
  return (
    <>
      <ActionSheetModal
        visible={visible}
        title={t('plugins.session.title', 'Plugins')}
        message={
          message ??
          (empty ? t('plugins.session.none', 'No enabled plugin has a panel yet.') : undefined)
        }
        actions={actions}
        onClose={props.onClose}
      />
      <PluginPanelSheet client={client} panel={openPanel} onClose={() => setOpenPanel(null)} />
    </>
  )
}
