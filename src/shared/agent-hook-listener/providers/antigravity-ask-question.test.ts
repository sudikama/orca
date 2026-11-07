import { describe, expect, it } from 'vitest'
import { createHookListenerState } from '../listener-state'
import { normalizeAntigravityEvent } from './antigravity-events'

// Recorded from agy 1.5.x: the hook carries args.questions as a real array.
const PRE_TOOL_USE = {
  conversationId: 'c-1',
  lastUserInput: 'Ask me.',
  modelName: 'gemini-3.8-flash-medium',
  stepIdx: 2,
  toolCall: {
    args: {
      questions: [
        { is_multi_select: false, options: ['(Recommended) Alpha', 'Beta'], question: 'Which?' }
      ]
    },
    name: 'ask_question'
  }
}

describe('antigravity ask_question hook', () => {
  it('reports a waiting row that carries the question', () => {
    const state = createHookListenerState()
    const payload = normalizeAntigravityEvent(state, 'PreToolUse', 'Ask me.', 'pane-1', PRE_TOOL_USE)
    expect(payload?.state).toBe('waiting')
    expect(payload?.toolName).toBe('ask_question')
    expect(JSON.parse(payload?.interactivePrompt ?? 'null')).toEqual({
      questions: [
        { question: 'Which?', multiSelect: false, options: ['(Recommended) Alpha', 'Beta'] }
      ]
    })
  })
})
