import type { NativeChatBlock, NativeChatMessage } from '../../shared/native-chat/native-chat-types'
import { extractString, parseJsonObject, timestampMs } from '../ai-vault/session-scanner-values'

const USER_SOURCES = new Set(['USER_EXPLICIT', 'USER'])
const USER_TYPES = new Set(['USER_INPUT', 'REQUEST'])
const REQUEST_OPEN = '<USER_REQUEST>'
const REQUEST_CLOSE = '</USER_REQUEST>'
const ANSWER_LINE = /^A\d+:/m

/** agy's `ask_question` args carry `questions` as a JSON string or array of {question, options, is_multi_select}. */
function askQuestionCall(toolCalls: unknown): { questions: unknown[] } | null {
  if (!Array.isArray(toolCalls)) {
    return null
  }
  for (const call of toolCalls) {
    if (typeof call !== 'object' || call === null) {
      continue
    }
    const entry = call as { name?: unknown; args?: unknown }
    if (entry.name !== 'ask_question' || typeof entry.args !== 'object' || entry.args === null) {
      continue
    }
    let raw = (entry.args as { questions?: unknown }).questions
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw)
      } catch {
        return null
      }
    }
    if (!Array.isArray(raw)) {
      return null
    }
    const questions = raw.flatMap((item) => {
      if (typeof item !== 'object' || item === null) {
        return []
      }
      const record = item as Record<string, unknown>
      return [
        {
          question: typeof record.question === 'string' ? record.question : '',
          multiSelect: record.is_multi_select === true,
          options: Array.isArray(record.options)
            ? record.options.filter((option): option is string => typeof option === 'string')
            : []
        }
      ]
    })
    return questions.length > 0 ? { questions } : null
  }
  return null
}

/** agy wraps the person's words in <USER_REQUEST> and appends its own metadata after them. */
function userRequestText(content: string): string | null {
  const start = content.indexOf(REQUEST_OPEN)
  if (start === -1) {
    return extractString(content) ?? null
  }
  const bodyStart = start + REQUEST_OPEN.length
  const end = content.indexOf(REQUEST_CLOSE, bodyStart)
  return (
    extractString(end === -1 ? content.slice(bodyStart) : content.slice(bodyStart, end)) ?? null
  )
}

/**
 * One line of agy's `brain/<id>/.system_generated/logs/transcript.jsonl`: the person's requests and
 * the model's replies. Tool, plan and system steps carry no chat text and decode to nothing.
 */
export function decodeAntigravityTranscriptLine(
  line: string,
  fallbackId: string
): NativeChatMessage | null {
  const record = parseJsonObject(line)
  if (!record) {
    return null
  }
  const source = extractString(record.source)
  const type = extractString(record.type)
  const content = extractString(record.content)
  const step = typeof record.step_index === 'number' ? record.step_index : null
  // Position-prefix every ID: a step index alone repeats across a rewritten transcript.
  const id = step === null ? fallbackId : `${fallbackId}:${step}`
  const parsed = timestampMs(record.created_at)
  const timestamp = Number.isNaN(parsed) ? null : parsed

  if (source === 'MODEL' && type === 'PLANNER_RESPONSE') {
    const blocks: NativeChatBlock[] = content ? [{ type: 'text', text: content }] : []
    const ask = askQuestionCall(record.tool_calls)
    if (ask) {
      blocks.push({ type: 'tool-call', name: 'ask_question', input: ask, callId: `${id}:ask` })
    }
    return blocks.length > 0
      ? { id, role: 'assistant', blocks, timestamp, source: 'transcript' }
      : null
  }
  if (!source || !type || !content) {
    return null
  }
  if (USER_SOURCES.has(source) && USER_TYPES.has(type)) {
    const text = userRequestText(content)
    return text
      ? { id, role: 'user', blocks: [{ type: 'text', text }], timestamp, source: 'transcript' }
      : null
  }
  // The step after an `ask_question` call records its answer as `A1: <choice>` lines.
  if (source === 'MODEL' && type === 'GENERIC' && ANSWER_LINE.test(content)) {
    const output = content
      .split('\n')
      .filter((line) => ANSWER_LINE.test(line))
      .join('\n')
    return {
      id,
      role: 'tool',
      blocks: [
        {
          type: 'tool-result',
          output,
          ...(step === null ? {} : { callId: `${fallbackId}:${step - 1}:ask` })
        }
      ],
      timestamp,
      source: 'transcript'
    }
  }
  return null
}
