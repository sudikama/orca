import { agentChoiceCliApply } from '../../agent-launch/choices/agent-choice-cli-apply'
import type { AgentSessionOptionCatalog, CatalogOption } from './agent-session-option-catalog-types'

// Why: worker-start needs launch serialization without exposing a new Native Chat option surface.
export const OPENCODE_LAUNCH_OPTION_CATALOG: AgentSessionOptionCatalog = {
  supportsWorkerLaunchPreferences: true,
  models: [],
  modelApply: {
    ...agentChoiceCliApply(
      'opencode',
      [
        {
          kind: 'value',
          names: ['-m', '--model'],
          lift: 'separate-and-long-equals'
        }
      ],
      '--model'
    )
  }
}

// OpenCode lists a model's variants (its thinking levels) only inside its own picker. The chat offers
// the usual names and the host matches them against that picker, which refuses a level the model lacks.
const OPENCODE_VARIANT: CatalogOption = {
  id: 'variant',
  label: 'Thinking effort',
  category: 'thought_level',
  kind: {
    type: 'select',
    choices: [
      { value: 'none', label: 'None' },
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'xhigh', label: 'Extra high' },
      { value: 'max', label: 'Max' }
    ],
    defaultValue: 'medium'
  },
  apply: { midSession: { kind: 'agent-picker', command: '/variants' } }
}

/** Native chat's picker catalog: models come from `opencode models`; both controls open OpenCode's own picker. */
export const OPENCODE_CHAT_OPTION_CATALOG: AgentSessionOptionCatalog = {
  models: [],
  discoveredModelsAreAuthoritative: true,
  listModels: {
    command: 'opencode models',
    parse: (stdout) =>
      stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^[^\s/]+\/\S+$/.test(line))
        .map((id) => ({ id, label: id, options: [] }))
  },
  modelApply: {
    ...OPENCODE_LAUNCH_OPTION_CATALOG.modelApply,
    midSession: { kind: 'agent-picker', command: '/models' }
  },
  unknownModelOptions: [OPENCODE_VARIANT]
}
