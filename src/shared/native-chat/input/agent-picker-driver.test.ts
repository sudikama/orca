import { describe, expect, it } from 'vitest'
import {
  driveAgentPicker,
  parseNumberedRows,
  parseOpenCodeDialogRows,
  type AgentPickerIo
} from './agent-picker-driver'
import fixtures from './agent-picker-driver.fixtures.json'

const DOWN = '\x1b[B'

const OPENCODE_MODELS = `
                                  Select model                                     esc
                                  Search
                                  OpenCode Go
                                  Crouton Alpha Free                              Free
                       ┃          Hy4
                       ╹▀▀▀▀▀▀    Grok 4.7
`
const OPENCODE_FILTERED = `
                                  Select model                                     esc
                                  glm-5.3
                                  GLM-5.3-Flash Free                          OpenCode
                                  GLM-5.3-Flash                            OpenCode Go
                                  GLM-5.3                                  OpenCode Go
                                  GLM-5.2                                  OpenCode Go
                                  Connect an integration ctrl+a  Favorite ctrl+f
                       ┃
                       ┃  Ask anything…
`
const VARIANTS_OPEN = `
                                  Select variant                                   esc
                                  Search
                                ● Default
                                  none
                                  low
                       ┃          high
                       ┃          xhigh
                       ╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
`

/** A scripted terminal: each write moves to the next named screen. */
function fakeTerminal(script: Record<string, string | string[]>, start = 'idle') {
  let state = start
  const keys: string[] = []
  const commands: string[] = []
  const next = (key: string): string | undefined => {
    const value = script[key]
    return Array.isArray(value) ? value.shift() : value
  }
  const io: AgentPickerIo = {
    command: async (text) => {
      commands.push(text)
      state = next(`cmd:${text}`) ?? state
    },
    keys: async (text) => {
      keys.push(text)
      state = next(`keys:${text}`) ?? state
    },
    screen: async () => (script[`screen:${state}`] as string | undefined) ?? '',
    sleep: async () => {}
  }
  return { io, keys, commands }
}

describe('codex picker rows', () => {
  it('reads numbered rows with their markers', () => {
    expect(parseNumberedRows(fixtures.codexEffort)).toEqual([
      { number: 1, label: 'Low', current: false, isDefault: false },
      { number: 2, label: 'Medium', current: true, isDefault: true },
      { number: 3, label: 'High', current: false, isDefault: false },
      { number: 4, label: 'Extra high', current: false, isDefault: false },
      { number: 5, label: 'More reasoning…', current: false, isDefault: false }
    ])
    expect(parseNumberedRows(fixtures.codexModels).map((r) => r.label)).toEqual([
      'GPT-6-Luna',
      'GPT-5.6-Terra',
      'GPT-5.6-Luna'
    ])
  })
})

describe('driving codex', () => {
  const script = {
    'cmd:/model': 'models',
    'screen:models': fixtures.codexModels,
    'keys:1': 'effort',
    'keys:2': 'effort',
    'screen:effort': fixtures.codexEffort,
    'keys:3': 'done',
    'screen:done': 'Model changed to gpt-6-luna high'
  }

  it('sets an effort on the current model', async () => {
    const { io, keys } = fakeTerminal(script)
    const result = await driveAgentPicker(io, { agent: 'codex', optionId: 'effort', value: 'high' })
    expect(result).toEqual({ ok: true })
    expect(keys).toEqual(['1', '3'])
  })

  it('matches Extra high for xhigh', async () => {
    const { io, keys } = fakeTerminal({ ...script, 'keys:4': 'done' })
    await driveAgentPicker(io, { agent: 'codex', optionId: 'effort', value: 'xhigh' })
    expect(keys).toEqual(['1', '4'])
  })

  it('picks a listed model and keeps the current effort', async () => {
    const { io, keys } = fakeTerminal({ ...script, 'keys:2': ['effort', 'done'] })
    const result = await driveAgentPicker(io, {
      agent: 'codex',
      optionId: 'model',
      value: 'gpt-5.6-terra'
    })
    expect(result.ok).toBe(true)
    // model row 2, then the effort row marked current (2)
    expect(keys).toEqual(['2', '2'])
  })

  it('refuses a model this account does not list, and backs out', async () => {
    const { io, keys } = fakeTerminal(script)
    const result = await driveAgentPicker(io, {
      agent: 'codex',
      optionId: 'model',
      value: 'gpt-9-nope'
    })
    expect(result).toMatchObject({ ok: false, reason: 'not-found' })
    expect(keys).toEqual(['\x1b', '\x1b'])
  })

  it('reports a list that never opens', async () => {
    const { io } = fakeTerminal({ 'screen:idle': 'nothing here' })
    const originalNow = Date.now
    let clock = 0
    Date.now = () => (clock += 5000)
    try {
      const result = await driveAgentPicker(io, {
        agent: 'codex',
        optionId: 'effort',
        value: 'low'
      })
      expect(result).toMatchObject({ ok: false, reason: 'not-open' })
    } finally {
      Date.now = originalNow
    }
  })
})

describe('driving opencode', () => {
  it('ignores the background art gutter when reading dialog rows', () => {
    expect(parseOpenCodeDialogRows(OPENCODE_MODELS, 'Select model')).toEqual([
      ['Search'],
      ['OpenCode Go'],
      ['Crouton Alpha Free', 'Free'],
      ['Hy4']
    ])
  })

  it('picks the row matching both name and provider', async () => {
    const { io, keys, commands } = fakeTerminal({
      'cmd:/models': 'open',
      'screen:open': OPENCODE_MODELS,
      'keys:glm-5.3': 'filtered',
      'screen:filtered': OPENCODE_FILTERED
    })
    const result = await driveAgentPicker(io, {
      agent: 'opencode',
      optionId: 'model',
      value: 'opencode-go/glm-5.3'
    })
    expect(result).toEqual({ ok: true })
    expect(commands).toEqual(['/models'])
    expect(keys).toEqual(['glm-5.3', `${DOWN}${DOWN}\r`])
  })

  it('retries with a shorter filter when the full id finds nothing', async () => {
    const { io, keys } = fakeTerminal({
      'cmd:/models': 'open',
      'screen:open': OPENCODE_MODELS,
      'keys:gpt-6-luna': 'empty',
      'screen:empty': '  Select model  esc\n  gpt-6-luna\n  No results found\n',
      'keys:gpt-6': 'filtered',
      'screen:filtered': `  Select model  esc
  gpt-6
  GPT-6 Luna      OpenCode Go
  GPT-5.6 Luna    OpenCode Go
  Connect an integration ctrl+a
`
    })
    const result = await driveAgentPicker(io, {
      agent: 'opencode',
      optionId: 'model',
      value: 'opencode-go/gpt-6-luna'
    })
    expect(result).toEqual({ ok: true })
    expect(keys).toEqual(['gpt-6-luna', '\x7f'.repeat(10), 'gpt-6', '\r'])
  })

  it('backs out when nothing matches', async () => {
    const { io, keys } = fakeTerminal({
      'cmd:/models': 'open',
      'screen:open': OPENCODE_MODELS,
      'keys:zzz': 'filtered',
      'screen:filtered': OPENCODE_FILTERED
    })
    const result = await driveAgentPicker(io, {
      agent: 'opencode',
      optionId: 'model',
      value: 'p/zzz'
    })
    expect(result).toMatchObject({ ok: false, reason: 'not-found' })
    expect(keys.slice(-2)).toEqual(['\x1b', '\x1b'])
  })

  it('sets a variant by name', async () => {
    const { io, keys } = fakeTerminal({
      'cmd:/variants': 'open',
      'screen:open': VARIANTS_OPEN,
      'keys:high': 'filtered',
      'screen:filtered': VARIANTS_OPEN.replace(
        'Default\n                                  none\n                                  low\n',
        ''
      ).replace('xhigh', 'xhigh')
    })
    const result = await driveAgentPicker(io, {
      agent: 'opencode',
      optionId: 'variant',
      value: 'high'
    })
    expect(result).toEqual({ ok: true })
    expect(keys).toEqual(['high', '\r'])
  })

  it('says so when the model has no variants', async () => {
    const { io, keys } = fakeTerminal({
      'cmd:/variants': 'open',
      'screen:open': 'No variants available\nThe current model does not support any variants.'
    })
    const result = await driveAgentPicker(io, {
      agent: 'opencode',
      optionId: 'variant',
      value: 'high'
    })
    expect(result).toMatchObject({ ok: false, reason: 'unsupported' })
    expect(keys).toEqual(['\x1b'])
  })
})
