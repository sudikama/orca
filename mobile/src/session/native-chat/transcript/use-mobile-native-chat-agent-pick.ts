import { useCallback, type MutableRefObject } from 'react'
import type { RpcClient } from '../../../transport/rpc-client'
import type { AgentPickRequest } from '../../../../../src/shared/native-chat/input/agent-picker-driver'
import { runMobileAgentPick } from '../mobile-native-chat-agent-picker'
import { openMobileNativeChatSendBudget } from '../mobile-native-chat-send'
import { healMobileNativeChatStaleInput } from '../mobile-native-chat-stale-input'
import {
  acquireMobileNativeChatTerminalWrite,
  releaseMobileNativeChatTerminalWrite
} from '../mobile-native-chat-terminal-write-lock'

export type MobileNativeChatAgentPick = (
  request: Omit<AgentPickRequest, 'agent'> & { agent: string }
) => Promise<void>

/** Sets a model or effort through the agent's own dialog, reading its screen; rejects with the reason. */
export function useMobileNativeChatAgentPick(args: {
  client: RpcClient | null
  enabled: boolean
  handleRef: MutableRefObject<string | null>
  deviceTokenRef: MutableRefObject<string | null>
  onSendError: (message: string) => void
}): MobileNativeChatAgentPick {
  const { client, enabled, handleRef, deviceTokenRef, onSendError } = args
  return useCallback(
    async (request) => {
      const terminal = handleRef.current
      if (!client || !terminal || !enabled) {
        throw new Error('The chat is not connected to its terminal.')
      }
      // Hold the terminal for the whole dialog so no message interleaves with its keys.
      if (!acquireMobileNativeChatTerminalWrite(terminal)) {
        throw new Error('The terminal is busy.')
      }
      try {
        const mobileClient = deviceTokenRef.current
          ? { id: deviceTokenRef.current, type: 'mobile' as const }
          : undefined
        if (
          !(await healMobileNativeChatStaleInput({
            client,
            terminal,
            deviceToken: deviceTokenRef.current,
            deadline: openMobileNativeChatSendBudget()
          }))
        ) {
          throw new Error('The terminal did not clear its input line.')
        }
        await runMobileAgentPick({
          client,
          terminal,
          ...(mobileClient ? { mobileClient } : {}),
          request: request as AgentPickRequest
        })
      } catch (error) {
        onSendError(error instanceof Error ? error.message : 'Could not change the setting.')
        throw error
      } finally {
        releaseMobileNativeChatTerminalWrite(terminal)
      }
    },
    [client, deviceTokenRef, enabled, handleRef, onSendError]
  )
}
