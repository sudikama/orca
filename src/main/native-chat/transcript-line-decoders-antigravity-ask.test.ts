import { describe, expect, it } from 'vitest'
import { scanPendingAsks } from '../../shared/native-chat/input/native-chat-ask'
import { decodeAntigravityTranscriptLine } from './transcript-line-decoders-antigravity'

// Steps as agy 1.5 recorded them for an `ask_question` turn.
const ASK_STEP = JSON.stringify({
  step_index: 1,
  source: 'MODEL',
  type: 'PLANNER_RESPONSE',
  status: 'DONE',
  created_at: '2026-11-07T05:25:36Z',
  tool_calls: [
    {
      name: 'ask_question',
      args: {
        questions:
          '[{"is_multi_select":false,"options":["Alpha","Beta"],"question":"Which option do you prefer?"}]'
      }
    }
  ]
})
const ANSWER_STEP = JSON.stringify({
  step_index: 2,
  source: 'MODEL',
  type: 'GENERIC',
  status: 'DONE',
  created_at: '2026-11-07T05:25:45Z',
  content:
    'Created At: 2026-11-07T13:25:43+08:00\nCompleted At: 2026-11-07T13:25:45+08:00\nA1: Beta'
})

describe('antigravity ask_question transcript steps', () => {
  it('decodes the call into a question the chat can show', () => {
    const message = decodeAntigravityTranscriptLine(ASK_STEP, 'c:1')
    expect(message?.role).toBe('assistant')
    expect(message?.blocks[0]).toMatchObject({ type: 'tool-call', name: 'ask_question' })
    const scan = scanPendingAsks([message!])
    expect(scan.blocking?.questions[0]).toMatchObject({
      question: 'Which option do you prefer?',
      multiSelect: false,
      options: [{ label: 'Alpha' }, { label: 'Beta' }]
    })
  })

  it('stops asking once the answer step is recorded', () => {
    const call = decodeAntigravityTranscriptLine(ASK_STEP, 'c:1')!
    const answer = decodeAntigravityTranscriptLine(ANSWER_STEP, 'c:2')!
    expect(answer.blocks[0]).toMatchObject({ type: 'tool-result', output: 'A1: Beta' })
    expect(scanPendingAsks([call, answer]).blocking).toBeNull()
  })

  it('also reads questions delivered as an array', () => {
    const line = JSON.stringify({
      step_index: 1,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      tool_calls: [
        { name: 'ask_question', args: { questions: [{ question: 'Q?', options: ['a', 'b'] }] } }
      ]
    })
    expect(scanPendingAsks([decodeAntigravityTranscriptLine(line, 'c:1')!]).blocking).not.toBeNull()
  })

  it('keeps ordinary tool steps out of the chat', () => {
    const line = JSON.stringify({
      step_index: 3,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      tool_calls: [{ name: 'run_command', args: { command: 'ls' } }]
    })
    expect(decodeAntigravityTranscriptLine(line, 'c:3')).toBeNull()
  })
})
