import { z } from 'zod'
import {
  driveAgentPicker,
  type AgentPickerIo,
  type AgentPickRequest
} from '../../../../src/shared/native-chat/input/agent-picker-driver'
import type { RpcClient } from '../../transport/rpc-client'
import { defineRpcOperation, runRpcOperation } from '../../transport/rpc-operation'
import {
  openMobileNativeChatSendBudget,
  sendMobileNativeChatMessageWithOutcome,
  typeMobileNativeChatCommandWithOutcome
} from './mobile-native-chat-send'

const screenReply = z.looseObject({
  terminal: z.looseObject({ tail: z.array(z.string()) })
})

const readScreen = defineRpcOperation({
  name: 'native-chat.agent-picker-screen',
  method: 'terminal.read',
  acceptance: 'require-result-or-throw',
  barrier: 'on-settle',
  read: (raw: unknown) => {
    const parsed = screenReply.safeParse(raw)
    return {
      compatible: true as const,
      variant: 'agent-picker-screen' as const,
      value: parsed.success ? parsed.data.terminal.tail.join('\n') : null,
      salvage: { droppedPaths: [], droppedCount: 0 }
    }
  }
})

/** The agents whose own pickers the phone can drive from the rendered screen. */
export const MOBILE_PICKER_DRIVEN_AGENTS: ReadonlySet<string> = new Set([
  'codex',
  'opencode',
  'opencode2'
])

export function isMobilePickerDrivenAgent(agent: string | null | undefined): boolean {
  return agent != null && MOBILE_PICKER_DRIVEN_AGENTS.has(agent)
}

function pickerIo(args: {
  client: RpcClient
  terminal: string
  mobileClient?: { id: string; type: 'mobile' }
}): AgentPickerIo {
  const { client, terminal, mobileClient } = args
  const accept = (outcome: string): void => {
    if (outcome !== 'accepted') {
      throw new Error('The terminal did not accept the keys.')
    }
  }
  return {
    command: async (text) => {
      accept(
        await typeMobileNativeChatCommandWithOutcome({
          client,
          terminal,
          command: text,
          ...(mobileClient ? { mobileClient } : {}),
          deadline: openMobileNativeChatSendBudget()
        })
      )
    },
    keys: async (text) => {
      accept(
        await sendMobileNativeChatMessageWithOutcome({
          client,
          terminal,
          text,
          enter: false,
          requireWriteSettlement: true,
          ...(mobileClient ? { mobileClient } : {}),
          deadline: openMobileNativeChatSendBudget()
        })
      )
    },
    screen: async () =>
      (await runRpcOperation(client, readScreen, { terminal, screen: true, limit: 80 })) ?? '',
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/** Sets a model or effort through the agent's own dialog; throws the reason when it cannot. */
export async function runMobileAgentPick(args: {
  client: RpcClient
  terminal: string
  mobileClient?: { id: string; type: 'mobile' }
  request: AgentPickRequest
}): Promise<void> {
  const result = await driveAgentPicker(pickerIo(args), args.request)
  if (!result.ok) {
    throw new Error(result.detail ?? 'The agent picker could not be driven.')
  }
}
