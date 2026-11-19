// Orca's plugin frame protocol (src/shared/plugins/frames), restated so the phone bundle carries
// none of its schemas. Keep the literals in sync with plugin-protocol.ts, plugin-frame-bridge.ts
// and plugin-panel-shell.ts.
const PROTOCOL = 1
const RETRYABLE_CODES: ReadonlySet<string> = new Set(['rate_limited', 'unavailable', 'timeout'])
const TOKENS_PLACEHOLDER = '/*__ORCA_PANEL_TOKENS__*/'
const COLOR_SCHEME_PLACEHOLDER = '__ORCA_COLOR_SCHEME__'

export type PanelHello = {
  protocol: number
  surface: 'panel'
  api: { major: number; minor: number }
  methods: string[]
}

export type PanelOutcome =
  | { ok: true; value: unknown }
  | { ok: false; code: string; error: string; retryAfterMs?: number }

export type PanelHostCall = (action: string, params: unknown) => Promise<PanelOutcome>

export type PluginPanelFrameProps = {
  html: string
  hello: PanelHello
  colorScheme: 'light' | 'dark'
  title: string
  call: PanelHostCall
}

/**
 * The panel document for the shell's script frame. That frame nests it one level down, so its
 * `window.parent` is the frame, not this page: point it at the page before the panel shell
 * captures it, and the page answers the nested frame directly.
 */
export function phonePanelDocument(html: string, colorScheme: 'light' | 'dark'): string {
  const filled = html
    .split(COLOR_SCHEME_PLACEHOLDER)
    .join(colorScheme)
    .split(TOKENS_PLACEHOLDER)
    .join('')
  return filled.replace('<head>\n', '<head>\n<script>window.parent = window.top</script>\n')
}

type Envelope = {
  orca?: unknown
  kind?: unknown
  id?: unknown
  event?: unknown
  method?: unknown
  params?: unknown
}

function asEnvelope(data: unknown): Envelope | null {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Envelope)
    : null
}

function failure(id: number, code: string, message: string, retryAfterMs?: number) {
  return {
    orca: PROTOCOL,
    kind: 'res',
    id,
    error: {
      code,
      message: message.slice(0, 8192),
      retryable: RETRYABLE_CODES.has(code),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs })
    }
  }
}

/** Answers one panel frame: hello on ready, host calls relayed to the host, cancels honored. */
export function createPanelBridge(input: {
  hello: PanelHello
  colorScheme: 'light' | 'dark'
  locale: string
  post: (message: unknown) => void
  call: PanelHostCall
}): (data: unknown) => void {
  const offered = new Set(input.hello.methods)
  const inFlight = new Set<number>()
  return (data) => {
    const message = asEnvelope(data)
    if (!message || message.orca !== PROTOCOL) {
      return
    }
    if (message.kind === 'evt') {
      if (message.event === 'ready') {
        input.post({
          orca: PROTOCOL,
          kind: 'evt',
          event: 'hello',
          payload: {
            ...input.hello,
            theme: { colorScheme: input.colorScheme, tokens: '' },
            locale: input.locale
          }
        })
      }
      return
    }
    const id =
      typeof message.id === 'number' && Number.isSafeInteger(message.id) ? message.id : null
    if (id === null) {
      return
    }
    if (message.kind === 'cancel') {
      inFlight.delete(id)
      return
    }
    if (message.kind !== 'req') {
      return
    }
    if (typeof message.method !== 'string' || !offered.has(message.method)) {
      input.post(failure(id, 'unknown_method', 'This panel method is not available on the phone.'))
      return
    }
    inFlight.add(id)
    input.call(message.method, message.params).then(
      (outcome) => {
        if (!inFlight.delete(id)) {
          return
        }
        input.post(
          outcome.ok
            ? { orca: PROTOCOL, kind: 'res', id, result: outcome.value }
            : failure(id, outcome.code, outcome.error, outcome.retryAfterMs)
        )
      },
      (error: unknown) => {
        if (inFlight.delete(id)) {
          input.post(
            failure(id, 'action_failed', error instanceof Error ? error.message : String(error))
          )
        }
      }
    )
  }
}
