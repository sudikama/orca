import { describe, expect, it } from 'vitest'
import { deriveAntigravityInteractivePrompt } from '../../agent-hook-listener/providers/antigravity-tool-fields'
import { readAgentPromptAnswers } from '../../agent-status/contracts/agent-pending-prompt'
import { shouldStepNativeChatAskAnswer } from '../native-chat-agent-support'
import { buildAskAnswerKeysForAgent } from './native-chat-ask-answer'
import { parseAskFromStatus } from './native-chat-ask'

const ARGS = {
  questions: JSON.stringify([
    { is_multi_select: false, options: ['Alpha', 'Beta'], question: 'Which option do you prefer?' }
  ])
}

describe('antigravity ask_question', () => {
  it('turns the JSON-string questions into the shared card shape', () => {
    const prompt = deriveAntigravityInteractivePrompt('ask_question', ARGS)!
    const ask = parseAskFromStatus(prompt, 'ask_question')
    expect(ask?.questions[0]).toMatchObject({
      question: 'Which option do you prefer?',
      multiSelect: false,
      options: [{ label: 'Alpha' }, { label: 'Beta' }]
    })
  })

  it('ignores other tools and malformed input', () => {
    expect(deriveAntigravityInteractivePrompt('run_command', ARGS)).toBeUndefined()
    expect(deriveAntigravityInteractivePrompt('ask_question', { questions: '{' })).toBeUndefined()
    expect(deriveAntigravityInteractivePrompt('ask_question', undefined)).toBeUndefined()
  })

  it('answers with down-arrows then Enter in one write', () => {
    const ask = parseAskFromStatus(deriveAntigravityInteractivePrompt('ask_question', ARGS), 'x')!
    expect(buildAskAnswerKeysForAgent('antigravity', ask, [{ indices: [1] }])).toEqual([
      { raw: '\x1b[B\r' }
    ])
    expect(buildAskAnswerKeysForAgent('antigravity', ask, [{ indices: [0] }])).toEqual([
      { raw: '\r' }
    ])
    expect(shouldStepNativeChatAskAnswer('antigravity')).toBe(true)
  })

  it('goes through the write-in row for a typed answer', () => {
    const ask = parseAskFromStatus(deriveAntigravityInteractivePrompt('ask_question', ARGS), 'x')!
    expect(
      buildAskAnswerKeysForAgent('antigravity', ask, [{ indices: [], other: 'Gamma' }])
    ).toEqual([{ raw: '\x1b[B\x1b[B\r' }, { text: 'Gamma' }, { raw: '\r' }])
  })

  it('offers each option as a remote answer for a waiting agy row', () => {
    const read = readAgentPromptAnswers(
      {
        state: 'waiting',
        interrupted: false,
        mainAgent: undefined,
        interactivePrompt: deriveAntigravityInteractivePrompt('ask_question', ARGS),
        toolName: 'ask_question'
      },
      'antigravity',
      'p1',
      true
    )
    expect(read?.prompt.kind).toBe('question')
    expect([...(read?.keysByOption ?? [])]).toEqual([
      ['1', '\r'],
      ['2', '\x1b[B\r']
    ])
  })
})
