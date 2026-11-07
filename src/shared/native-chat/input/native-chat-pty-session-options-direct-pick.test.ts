import { describe, expect, it } from 'vitest'
import { createNativeChatPtySessionOptions } from './native-chat-pty-session-options'

function codex(pick?: (request: { optionId: string; value: string }) => Promise<void>) {
  const sent: string[] = []
  let picker = 0
  const surface = createNativeChatPtySessionOptions({
    agent: 'codex',
    scopeKey: `direct-pick-${Math.random()}`,
    mode: 'live',
    modelLabel: 'Model',
    dispatchCommand: async (command) => {
      sent.push(command)
    },
    onAgentPicker: () => {
      picker += 1
    },
    ...(pick ? { pickAgentOption: pick } : {})
  })!
  return { surface, sent, picker: () => picker }
}

describe('picker-backed options', () => {
  it('open the terminal picker when the host cannot drive it', async () => {
    const { surface, sent, picker } = codex()
    expect(surface.getSnapshot().find((d) => d.id === 'model')?.action).toEqual({
      type: 'agent-picker'
    })
    await expect(surface.setOption('model', 'gpt-5.5')).rejects.toThrow()
    await surface.invokeAction('model')
    expect(sent).toEqual(['/model'])
    expect(picker()).toBe(1)
  })

  it('become ordinary selects that call the driver when it can', async () => {
    const picks: { optionId: string; value: string }[] = []
    const { surface, sent, picker } = codex(async (request) => {
      picks.push(request)
    })
    expect(surface.getSnapshot().find((d) => d.id === 'model')?.action).toBeUndefined()
    await surface.setOption('model', 'gpt-5.5')
    const effort = surface.getSnapshot().find((d) => d.id === 'effort')
    expect(effort?.action).toBeUndefined()
    await surface.setOption('effort', 'high')
    expect(picks).toEqual([
      { optionId: 'model', value: 'gpt-5.5' },
      { optionId: 'effort', value: 'high' }
    ])
    // The terminal view is never opened and no typed command goes out.
    expect(sent).toEqual([])
    expect(picker()).toBe(0)
    const shown = surface.getSnapshot()
    expect(shown.find((d) => d.id === 'model')?.kind).toMatchObject({ currentValue: 'gpt-5.5' })
    expect(shown.find((d) => d.id === 'effort')?.kind).toMatchObject({ currentValue: 'high' })
  })

  it('leaves the pick unrecorded when the driver fails', async () => {
    const { surface } = codex(async () => {
      throw new Error('Codex does not offer gpt-5.5 here.')
    })
    await expect(surface.setOption('model', 'gpt-5.5')).rejects.toThrow('does not offer')
    expect(surface.getSnapshot().find((d) => d.id === 'model')?.kind).not.toMatchObject({
      currentValue: 'gpt-5.5'
    })
  })
})
