/**
 * Drives an agent's own selector dialogs (Codex `/model`, OpenCode `/models` and `/variants`) from
 * what the terminal renders, so a chat can set a model or effort without handing the screen to the
 * reader. Rows are matched by label on the live screen; nothing here assumes a fixed row order.
 */

export type AgentPickerIo = {
  /** Types a slash command and presses Enter. */
  command(text: string): Promise<void>
  /** Writes raw keystrokes; no Enter is appended. */
  keys(text: string): Promise<void>
  /** The rendered screen, one string with newline-separated rows. */
  screen(): Promise<string>
  sleep(ms: number): Promise<void>
}

export type AgentPickRequest = {
  agent: 'codex' | 'opencode' | 'opencode2'
  optionId: string
  value: string
}

export type AgentPickResult =
  | { ok: true }
  | { ok: false; reason: 'not-open' | 'not-found' | 'unsupported'; detail?: string }

const ESC = '\x1b'
const ENTER = '\r'
const DOWN = '\x1b[B'
const BACKSPACE = '\x7f'
const POLL_MS = 300
const WAIT_MS = 8000

export function normalizePickerLabel(label: string): string {
  return label.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
}

async function waitFor(
  io: AgentPickerIo,
  test: (screen: string) => boolean,
  timeoutMs = WAIT_MS
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const screen = await io.screen()
    if (test(screen)) {
      return screen
    }
    if (Date.now() >= deadline) {
      return null
    }
    await io.sleep(POLL_MS)
  }
}

async function cancel(io: AgentPickerIo): Promise<void> {
  await io.keys(ESC)
  await io.sleep(250)
  await io.keys(ESC)
}

// ---- Codex ----

export type NumberedRow = { number: number; label: string; current: boolean; isDefault: boolean }

/** Rows like `› 2. Medium (default) (current)    Balances speed…`. */
export function parseNumberedRows(screen: string): NumberedRow[] {
  const rows: NumberedRow[] = []
  for (const line of screen.split('\n')) {
    const match = /^\s*[›>]?\s*(\d+)\.\s+(\S.*?)(?:\s{2,}\S.*)?\s*$/.exec(line)
    if (!match) {
      continue
    }
    const raw = match[2]
    rows.push({
      number: Number(match[1]),
      label: raw.replaceAll(/\((?:current|default)\)/g, '').trim(),
      current: raw.includes('(current)'),
      isDefault: raw.includes('(default)')
    })
  }
  return rows
}

const CODEX_EFFORT_LABELS: Record<string, string[]> = {
  minimal: ['minimal'],
  low: ['low'],
  medium: ['medium'],
  high: ['high'],
  xhigh: ['extrahigh', 'xhigh'],
  max: ['max'],
  ultra: ['ultra']
}

function codexRowFor(rows: NumberedRow[], wanted: string): NumberedRow | undefined {
  const target = normalizePickerLabel(wanted)
  return rows.find((row) => normalizePickerLabel(row.label) === target)
}

function codexEffortRow(rows: NumberedRow[], effort: string): NumberedRow | undefined {
  const labels = CODEX_EFFORT_LABELS[effort] ?? [normalizePickerLabel(effort)]
  return rows.find((row) => labels.includes(normalizePickerLabel(row.label)))
}

async function pressRow(io: AgentPickerIo, row: NumberedRow): Promise<boolean> {
  if (row.number > 9) {
    return false
  }
  await io.keys(String(row.number))
  return true
}

async function driveCodex(io: AgentPickerIo, request: AgentPickRequest): Promise<AgentPickResult> {
  await io.command('/model')
  const modelScreen = await waitFor(io, (s) => s.includes('Select Model and Effort'))
  if (!modelScreen) {
    await cancel(io)
    return { ok: false, reason: 'not-open', detail: 'Codex did not open its model list.' }
  }
  const modelRows = parseNumberedRows(modelScreen)
  const modelRow =
    request.optionId === 'model'
      ? codexRowFor(modelRows, request.value)
      : modelRows.find((row) => row.current)
  if (!modelRow || !(await pressRow(io, modelRow))) {
    await cancel(io)
    return {
      ok: false,
      reason: 'not-found',
      detail: `Codex does not offer ${request.optionId === 'model' ? request.value : 'a current model'} here.`
    }
  }
  const effortScreen = await waitFor(
    io,
    (s) => s.includes('Select Reasoning Level') || s.includes('Model changed')
  )
  if (!effortScreen) {
    await cancel(io)
    return { ok: false, reason: 'not-open', detail: 'Codex did not confirm the change.' }
  }
  if (!effortScreen.includes('Select Reasoning Level')) {
    return { ok: true }
  }
  let rows = parseNumberedRows(effortScreen)
  let row =
    request.optionId === 'effort'
      ? codexEffortRow(rows, request.value)
      : (rows.find((candidate) => candidate.current) ??
        rows.find((candidate) => candidate.isDefault))
  if (!row && request.optionId === 'effort') {
    const more = rows.find((candidate) => normalizePickerLabel(candidate.label) === 'morereasoning')
    if (more && (await pressRow(io, more))) {
      const expanded = await waitFor(io, (s) => s.includes('Select Reasoning Level'))
      rows = expanded ? parseNumberedRows(expanded) : []
      row = codexEffortRow(rows, request.value)
    }
  }
  if (!row) {
    if (request.optionId === 'model') {
      await io.keys(ENTER)
      return { ok: true }
    }
    await cancel(io)
    return {
      ok: false,
      reason: 'not-found',
      detail: `This Codex model has no ${request.value} effort.`
    }
  }
  if (!(await pressRow(io, row))) {
    await cancel(io)
    return { ok: false, reason: 'not-found', detail: 'The effort row is out of reach.' }
  }
  const done = await waitFor(io, (s) => s.includes('Model changed'), 4000)
  return done ? { ok: true } : { ok: false, reason: 'not-open', detail: 'No confirmation seen.' }
}

// ---- OpenCode ----

/** Dialog rows between a dialog's title and its footer, with the background art's gutter removed. */
export function parseOpenCodeDialogRows(screen: string, title: string): string[][] {
  const lines = screen.split('\n')
  const start = lines.findIndex((line) => line.includes(title))
  if (start === -1) {
    return []
  }
  const rows: string[][] = []
  for (const line of lines.slice(start + 1)) {
    const text = line.slice(line.lastIndexOf('┃') + 1).replace(/^[\s●○>]+/, '')
    if (/Connect an integration|▀▀▀|╹/.test(line)) {
      break
    }
    if (!text.trim()) {
      continue
    }
    rows.push(text.trim().split(/\s{2,}/))
  }
  return rows
}

/** The first dialog row is the highlighted one once a filter is typed; the first line is the search box. */
function dialogResultRows(screen: string, title: string): string[][] {
  return parseOpenCodeDialogRows(screen, title).slice(1)
}

/** The search box matches display names, which punctuate differently from ids, so retry with shorter filters. */
export function openCodeSearchFilters(text: string): string[] {
  const parts = text.split('-')
  const candidates = [text, parts.slice(0, 2).join('-'), parts[0] ?? text]
  return [...new Set(candidates.filter((candidate) => candidate.length > 0))]
}

async function chooseOpenCodeRow(
  io: AgentPickerIo,
  title: string,
  filters: string[],
  matches: (cells: string[]) => boolean
): Promise<AgentPickResult> {
  let typed = ''
  for (const filter of filters) {
    if (typed) {
      await io.keys(BACKSPACE.repeat(typed.length))
    }
    await io.keys(filter)
    typed = filter
    await io.sleep(700)
    const rows = dialogResultRows(await io.screen(), title)
    const index = rows.findIndex(matches)
    if (index !== -1) {
      await io.keys(DOWN.repeat(index) + ENTER)
      return { ok: true }
    }
  }
  await cancel(io)
  return { ok: false, reason: 'not-found', detail: `OpenCode has no match for ${filters[0]}.` }
}

async function driveOpenCodeVariant(io: AgentPickerIo, value: string): Promise<AgentPickResult> {
  const screen = await waitFor(
    io,
    (s) => s.includes('Select variant') || s.includes('No variants available')
  )
  if (!screen || screen.includes('No variants available')) {
    await io.keys(ESC)
    return {
      ok: false,
      reason: screen ? 'unsupported' : 'not-open',
      detail: screen ? 'This model has no variants.' : 'OpenCode did not open its variant list.'
    }
  }
  const target = normalizePickerLabel(value)
  return chooseOpenCodeRow(
    io,
    'Select variant',
    [value],
    (cells) => normalizePickerLabel(cells[0] ?? '') === target
  )
}

async function driveOpenCode(
  io: AgentPickerIo,
  request: AgentPickRequest
): Promise<AgentPickResult> {
  if (request.optionId === 'variant' || request.optionId === 'effort') {
    await io.command('/variants')
    return driveOpenCodeVariant(io, request.value)
  }
  const slash = request.value.indexOf('/')
  const provider = slash === -1 ? '' : request.value.slice(0, slash)
  const modelPart = slash === -1 ? request.value : request.value.slice(slash + 1)
  await io.command('/models')
  if (!(await waitFor(io, (s) => s.includes('Select model')))) {
    await cancel(io)
    return { ok: false, reason: 'not-open', detail: 'OpenCode did not open its model list.' }
  }
  const nameTarget = normalizePickerLabel(modelPart)
  const providerTarget = normalizePickerLabel(provider)
  const picked = await chooseOpenCodeRow(
    io,
    'Select model',
    openCodeSearchFilters(modelPart),
    (cells) => {
      const nameMatches = normalizePickerLabel(cells[0] ?? '') === nameTarget
      const providerCell = normalizePickerLabel(cells.slice(1).join(''))
      return nameMatches && (!providerTarget || providerCell === providerTarget)
    }
  )
  if (!picked.ok) {
    return picked
  }
  // A model with variants opens its variant list next; keep the default instead of leaving it open.
  await io.sleep(1200)
  const after = await io.screen()
  if (after.includes('Select variant')) {
    await io.keys(ESC)
  }
  return { ok: true }
}

export async function driveAgentPicker(
  io: AgentPickerIo,
  request: AgentPickRequest
): Promise<AgentPickResult> {
  if (request.agent === 'codex') {
    return driveCodex(io, request)
  }
  return driveOpenCode(io, request)
}
