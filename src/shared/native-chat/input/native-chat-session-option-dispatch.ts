import type {
  CatalogAgentInteractionDetection,
  CatalogCommandDelivery
} from '../../agent-session/options/agent-session-option-catalog-types'

export type ClaudeModelSwitchOutcome = 'applied' | 'rejected' | 'unknown'

export type NativeChatSessionOptionDispatchResult = {
  outcome?: ClaudeModelSwitchOutcome
}

export type NativeChatSessionOptionDispatchCommand = (
  command: string,
  options?: {
    detectAgentInteraction?: CatalogAgentInteractionDetection
    expectedChoiceLabel?: string
    delivery?: CatalogCommandDelivery
  }
) =>
  | Promise<NativeChatSessionOptionDispatchResult | void>
  | NativeChatSessionOptionDispatchResult
  | void

/** Sets one value by driving the agent's own picker dialog; rejects when the dialog cannot be driven. */
export type NativeChatPickAgentOption = (request: {
  optionId: string
  value: string
}) => Promise<void>
