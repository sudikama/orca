import { describe, expect, it } from 'vitest'
import { decodeAntigravityTranscriptLine } from './transcript-line-decoders-antigravity'

// Lines as agy 1.5 writes them to brain/<id>/.system_generated/logs/transcript.jsonl.
const USER_LINE = JSON.stringify({
  step_index: 0,
  source: 'USER_EXPLICIT',
  type: 'USER_INPUT',
  status: 'DONE',
  created_at: '2026-11-07T02:00:34Z',
  content:
    '<USER_REQUEST>\nReply with the single word: ok\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026-11-07T10:00:34+08:00.\n</ADDITIONAL_METADATA>'
})
const MODEL_LINE = JSON.stringify({
  step_index: 1,
  source: 'MODEL',
  type: 'PLANNER_RESPONSE',
  status: 'DONE',
  created_at: '2026-11-07T02:00:35Z',
  input_tokens: 6989,
  output_tokens: 16,
  content: 'ok'
})

describe('decodeAntigravityTranscriptLine', () => {
  it('keeps only what the person typed from a user step', () => {
    expect(decodeAntigravityTranscriptLine(USER_LINE, 'f:3')).toEqual({
      id: 'f:3:0',
      role: 'user',
      blocks: [{ type: 'text', text: 'Reply with the single word: ok' }],
      timestamp: Date.parse('2026-11-07T02:00:34Z'),
      source: 'transcript'
    })
  })

  it('reads the model reply as the assistant message', () => {
    expect(decodeAntigravityTranscriptLine(MODEL_LINE, 'f:4')).toEqual({
      id: 'f:4:1',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'ok' }],
      timestamp: Date.parse('2026-11-07T02:00:35Z'),
      source: 'transcript'
    })
  })

  it('accepts the older USER/REQUEST step names', () => {
    const line = JSON.stringify({
      source: 'USER',
      type: 'REQUEST',
      content: '<USER_REQUEST>follow-up</USER_REQUEST>'
    })
    expect(decodeAntigravityTranscriptLine(line, 'f:9')).toMatchObject({
      id: 'f:9',
      role: 'user',
      blocks: [{ type: 'text', text: 'follow-up' }]
    })
  })

  it('skips tool and system steps, empty content and bad lines', () => {
    const step = (source: string, type: string, content: string) =>
      JSON.stringify({ step_index: 2, source, type, content })
    expect(decodeAntigravityTranscriptLine(step('MODEL', 'RUN_COMMAND', 'ls'), 'f:1')).toBeNull()
    expect(decodeAntigravityTranscriptLine(step('SYSTEM', 'EPHEMERAL_MESSAGE', 'x'), 'f:1')).toBeNull()
    expect(decodeAntigravityTranscriptLine(step('MODEL', 'PLANNER_RESPONSE', ''), 'f:1')).toBeNull()
    expect(decodeAntigravityTranscriptLine('not json', 'f:1')).toBeNull()
    expect(decodeAntigravityTranscriptLine('', 'f:1')).toBeNull()
  })

  it('leaves the timestamp empty when the step has none', () => {
    const line = JSON.stringify({ source: 'MODEL', type: 'PLANNER_RESPONSE', content: 'hi' })
    expect(decodeAntigravityTranscriptLine(line, 'f:1')?.timestamp).toBeNull()
  })
})
