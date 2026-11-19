import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useMobileNativeChatVisualFrameGrant } from '../session/native-chat/visual/use-mobile-native-chat-visual-frame-grant'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { styles } from './mobile-plugins-styles'
import type { PanelHello, PanelOutcome } from './plugin-panel-bridge'
import { PluginPanelFrame } from './PluginPanelFrame'

export type OpenPluginPanel = { pluginKey: string; panelId: string; title: string }

type PanelState =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'components' }
  | { kind: 'ready'; html: string; sessionToken: string; hello: PanelHello }

const UNREADABLE: PanelOutcome = {
  ok: false,
  code: 'action_failed',
  error: 'The host sent an unreadable answer.'
}

function readHello(value: unknown): PanelHello | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const hello = value as Partial<PanelHello>
  return typeof hello.protocol === 'number' &&
    hello.surface === 'panel' &&
    Array.isArray(hello.methods) &&
    typeof hello.api?.major === 'number' &&
    typeof hello.api.minor === 'number'
    ? (hello as PanelHello)
    : null
}

function readOutcome(value: unknown): PanelOutcome {
  const outcome =
    typeof value === 'object' && value !== null ? (value as { outcome?: unknown }).outcome : null
  if (typeof outcome !== 'object' || outcome === null) {
    return UNREADABLE
  }
  const candidate = outcome as {
    ok?: unknown
    value?: unknown
    code?: unknown
    error?: unknown
    retryAfterMs?: unknown
  }
  if (candidate.ok === true) {
    return { ok: true, value: candidate.value }
  }
  if (
    candidate.ok === false &&
    typeof candidate.code === 'string' &&
    typeof candidate.error === 'string'
  ) {
    return {
      ok: false,
      code: candidate.code,
      error: candidate.error,
      ...(typeof candidate.retryAfterMs === 'number'
        ? { retryAfterMs: candidate.retryAfterMs }
        : {})
    }
  }
  return UNREADABLE
}

/** One plugin panel, run in the shell's script frame and bridged to the host over RPC. */
export function PluginPanelSheet(props: {
  client: RpcClient | null
  panel: OpenPluginPanel | null
  onClose: () => void
}) {
  const colorScheme = useMobileColorScheme()
  const t = useMobileTranslation()
  const scripted = useMobileNativeChatVisualFrameGrant()
  const [state, setState] = useState<PanelState>({ kind: 'loading' })
  const { client, panel } = props
  const pluginKey = panel?.pluginKey ?? null
  const panelId = panel?.panelId ?? null

  useEffect(() => {
    if (!client || !pluginKey || !panelId) {
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    void Promise.all([
      client.sendRequest('plugins.readPanelEntry', { pluginKey, panelId }),
      client.sendRequest('plugins.panelHello')
    ]).then(
      ([entryRes, helloRes]) => {
        if (cancelled) {
          return
        }
        if (!entryRes.ok) {
          setState({ kind: 'failed', message: entryRes.error.message })
          return
        }
        if (!helloRes.ok) {
          setState({ kind: 'failed', message: helloRes.error.message })
          return
        }
        const entry = entryRes.result as {
          html?: unknown
          sessionToken?: unknown
          ui?: unknown
        } | null
        if (entry?.ui === 'components') {
          setState({ kind: 'components' })
          return
        }
        const hello = readHello(helloRes.result)
        if (
          !entry ||
          typeof entry.html !== 'string' ||
          typeof entry.sessionToken !== 'string' ||
          !hello
        ) {
          setState({
            kind: 'failed',
            message: t('plugins.panel.unreadable', 'The host could not open this panel.')
          })
          return
        }
        setState({ kind: 'ready', html: entry.html, sessionToken: entry.sessionToken, hello })
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'failed',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [client, pluginKey, panelId, t])

  const sessionToken = state.kind === 'ready' ? state.sessionToken : null
  const call = useCallback(
    async (action: string, params: unknown): Promise<PanelOutcome> => {
      if (!client || !sessionToken) {
        return { ok: false, code: 'unavailable', error: 'plugin session is not ready' }
      }
      const res = await client.sendRequest('plugins.panelAction', { sessionToken, action, params })
      return res.ok
        ? readOutcome(res.result)
        : { ok: false, code: 'action_failed', error: res.error.message }
    },
    [client, sessionToken]
  )

  return (
    <BottomDrawer
      visible={panel !== null}
      onClose={props.onClose}
      fillAvailable
      // Fork: no outer ScrollView, so the frame takes the sheet's full height and the panel
      // scrolls inside its own document instead of being cut off at a fixed height.
      contentScrollable={false}
    >
      {panel ? (
        <View style={styles.panelBody}>
          <Text style={styles.sheetTitle}>{panel.title}</Text>
          {!scripted ? (
            <Text style={styles.hint}>
              {t('plugins.panel.needsUpdate', 'Update the Orca app to open plugin panels here.')}
            </Text>
          ) : state.kind === 'loading' ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : state.kind === 'failed' ? (
            <Text style={styles.errorText}>{state.message}</Text>
          ) : state.kind === 'components' ? (
            <Text style={styles.hint}>
              {t('plugins.panel.components', 'This panel only opens in the desktop app.')}
            </Text>
          ) : (
            <View style={styles.panelFrame}>
              <PluginPanelFrame
                key={state.html}
                html={state.html}
                hello={state.hello}
                colorScheme={colorScheme}
                title={panel.title}
                call={call}
              />
            </View>
          )}
        </View>
      ) : null}
    </BottomDrawer>
  )
}
