import { agentChoiceCliApply } from '../../agent-launch/choices/agent-choice-cli-apply'
import type {
  AgentSessionOptionCatalog,
  CatalogModel,
  CatalogOption
} from './agent-session-option-catalog-types'

const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const EFFORT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max'
}
const LEVEL_SUFFIX = /^(.+)-(low|medium|high|xhigh|max)$/
const LABEL_LEVEL_SUFFIX = /^(.*?)\s*\((low|medium|high|xhigh|max)\)$/i

function antigravityEffort(levels: readonly string[]): CatalogOption {
  return {
    id: 'effort',
    label: 'Reasoning effort',
    category: 'thought_level',
    kind: {
      type: 'select',
      choices: levels.map((value) => ({ value, label: EFFORT_LABELS[value] ?? value })),
      defaultValue: levels.includes('medium') ? 'medium' : (levels[0] ?? 'medium')
    },
    apply: {
      ...agentChoiceCliApply(
        'antigravity',
        [
          {
            kind: 'value',
            names: ['--effort'],
            lift: 'separate-and-long-equals'
          }
        ],
        '--effort'
      ),
      // `/effort <level>` applies at once; verified against agy 1.5.x.
      midSession: { kind: 'command', build: (value) => `/effort ${String(value)}` }
    }
  }
}

/** Effort-only fallback for ids the listing does not name. */
const ANTIGRAVITY_UNKNOWN_MODEL_EFFORT = antigravityEffort(['low', 'medium', 'high'])

type ListedModel = { id: string; label: string }

/**
 * `agy models` lists one slug per model and effort (`gemini-4-argon-high`). The CLI also takes the
 * family slug plus a separate `/effort`, so a family with two or more levels becomes one model
 * row with an effort control; a lone level keeps its own slug.
 */
export function groupAntigravityModels(listed: readonly ListedModel[]): CatalogModel[] {
  const families = new Map<string, { label: string; levels: Set<string>; members: ListedModel[] }>()
  const order: string[] = []
  for (const model of listed) {
    const idMatch = LEVEL_SUFFIX.exec(model.id)
    const labelMatch = LABEL_LEVEL_SUFFIX.exec(model.label)
    const key = idMatch ? idMatch[1] : model.id
    let family = families.get(key)
    if (!family) {
      family = { label: labelMatch ? labelMatch[1] : model.label, levels: new Set(), members: [] }
      families.set(key, family)
      order.push(key)
    }
    if (idMatch) {
      family.levels.add(idMatch[2])
    }
    family.members.push(model)
  }
  return order.map((key) => {
    const family = families.get(key)!
    const levels = EFFORT_ORDER.filter((level) => family.levels.has(level))
    if (levels.length >= 2) {
      return { id: key, label: family.label, options: [antigravityEffort(levels)] }
    }
    const only = family.members[0]
    return { id: only.id, label: family.label, options: [] }
  })
}

export function parseAntigravityCatalogModels(stdout: string): CatalogModel[] {
  const listed: ListedModel[] = []
  for (const raw of stdout.split('\n')) {
    const tab = raw.indexOf('\t')
    if (tab === -1) {
      continue
    }
    const id = raw.slice(0, tab).trim()
    const label = raw.slice(tab + 1).trim()
    if (id && label && !/\s/.test(id)) {
      listed.push({ id, label })
    }
  }
  return groupAntigravityModels(listed)
}

export const ANTIGRAVITY_SESSION_OPTION_CATALOG: AgentSessionOptionCatalog = {
  supportsWorkerLaunchPreferences: true,
  // Model availability is account-scoped; the host's `agy models` listing fills the picker.
  models: [],
  discoveredModelsAreAuthoritative: true,
  listModels: { command: 'agy models', parse: parseAntigravityCatalogModels },
  modelApply: {
    ...agentChoiceCliApply(
      'antigravity',
      [
        {
          kind: 'value',
          names: ['--model'],
          lift: 'separate-and-long-equals'
        }
      ],
      '--model'
    ),
    // `/model <id>` switches at once (family or full slug); verified against agy 1.5.x.
    midSession: { kind: 'command', build: (value) => `/model ${String(value)}` }
  },
  unknownModelOptions: [ANTIGRAVITY_UNKNOWN_MODEL_EFFORT]
}
