import { useEffect, useRef } from 'react'
import {
  MOBILE_NATIVE_CHAT_VISUAL_FRAME_PATH,
  mobileNativeChatVisualDocumentMessage
} from '../session/native-chat/visual/mobile-native-chat-visual-frame-contract'
import {
  createPanelBridge,
  phonePanelDocument,
  type PluginPanelFrameProps
} from './plugin-panel-bridge'

// A DOM style, not a StyleSheet entry: this element is an iframe, not a react-native view.
const IFRAME_STYLE = {
  border: 'none',
  display: 'block',
  width: '100%',
  height: '100%',
  flex: '1 1 auto',
  minHeight: 0,
  backgroundColor: 'transparent'
} as const

/** Runs a plugin panel in the shell's script frame; the page relays its host calls over RPC. */
export function PluginPanelFrame(props: PluginPanelFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const { html, hello, colorScheme, title, call } = props

  useEffect(() => {
    // The panel is the frame's first child; a cross-origin frame still exposes children by index.
    const panelWindow = (): Window | null => frameRef.current?.contentWindow?.[0] ?? null
    const handle = createPanelBridge({
      hello,
      colorScheme,
      locale: navigator.language,
      call,
      post: (message) => panelWindow()?.postMessage(message, '*')
    })
    const onMessage = (event: MessageEvent): void => {
      const source = panelWindow()
      // Sandboxed frames have opaque origins: trust the sending window, never event.origin.
      if (source !== null && event.source === source) {
        handle(event.data)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [hello, colorScheme, call])

  return (
    <iframe
      ref={frameRef}
      title={title}
      src={MOBILE_NATIVE_CHAT_VISUAL_FRAME_PATH}
      // Never allow-same-origin: the opaque origin keeps the panel away from the page's.
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      style={IFRAME_STYLE}
      onLoad={() =>
        frameRef.current?.contentWindow?.postMessage(
          mobileNativeChatVisualDocumentMessage(phonePanelDocument(html, colorScheme), title),
          '*'
        )
      }
    />
  )
}
