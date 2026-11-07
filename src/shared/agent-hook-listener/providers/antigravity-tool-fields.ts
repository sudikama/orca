import type { ToolSnapshot } from '../listener-event'
import {
  deriveFallbackToolInputPreview,
  deriveToolInputPreview,
  readString,
  toolUpdate
} from '../tool-input-preview'
import { readFirstString } from '../interactive-tool'
import { readLastAssistantFromTranscript } from '../transcript-lines'
import { isAntigravityStopStillBusy } from './antigravity-event-rules'

export function readAntigravityToolCall(hookPayload: Record<string, unknown>): {
  toolName?: string
  toolInputSource?: unknown
} {
  const toolCall = hookPayload.toolCall
  if (typeof toolCall !== 'object' || toolCall === null) {
    return {}
  }
  const record = toolCall as Record<string, unknown>
  return {
    toolName: readFirstString(record, ['name', 'toolName', 'tool_name']),
    toolInputSource: record.args
  }
}

/**
 * agy's `ask_question` passes its questions as a JSON string of
 * `[{question, options: string[], is_multi_select}]`; the cards read `{questions: [...]}`.
 */
export function deriveAntigravityInteractivePrompt(
  toolName: string | undefined,
  toolInputSource: unknown
): string | undefined {
  if (toolName !== 'ask_question' || typeof toolInputSource !== 'object' || !toolInputSource) {
    return undefined
  }
  let raw = (toolInputSource as Record<string, unknown>).questions
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  if (!Array.isArray(raw)) {
    return undefined
  }
  const questions = raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return []
    }
    const record = entry as Record<string, unknown>
    const question = typeof record.question === 'string' ? record.question : ''
    const options = Array.isArray(record.options)
      ? record.options.filter((option): option is string => typeof option === 'string')
      : []
    return question || options.length > 0
      ? [{ question, multiSelect: record.is_multi_select === true, options }]
      : []
  })
  return questions.length > 0 ? JSON.stringify({ questions }) : undefined
}

export function extractAntigravityToolFields(
  eventName: unknown,
  hookPayload: Record<string, unknown>
): ToolSnapshot {
  if (eventName === 'PreToolUse' || eventName === 'PostToolUse') {
    const toolCall = readAntigravityToolCall(hookPayload)
    const toolName = toolCall.toolName
    const toolInput =
      deriveToolInputPreview(toolName, toolCall.toolInputSource) ??
      deriveFallbackToolInputPreview(toolCall.toolInputSource)
    return toolUpdate(
      {
        toolName,
        toolInput,
        interactivePrompt:
          eventName === 'PreToolUse'
            ? deriveAntigravityInteractivePrompt(toolName, toolCall.toolInputSource)
            : undefined
      },
      { hasToolInputField: toolCall.toolInputSource !== undefined }
    )
  }
  if (eventName === 'Stop') {
    if (isAntigravityStopStillBusy(hookPayload)) {
      return {}
    }
    const message =
      readString(hookPayload, 'last_assistant_message') ??
      readLastAssistantFromTranscript(hookPayload.transcriptPath ?? hookPayload.transcript_path)
    if (message) {
      return { lastAssistantMessage: message }
    }
  }
  return {}
}
