import {
  createClaudeCatalogOptions,
  createCodexCatalogOptions
} from '../../agent-session/options/agent-session-option-catalog-claude-codex'
import { groupAntigravityModels } from '../../agent-session/options/agent-session-option-catalog-antigravity'
import {
  getNativeChatSessionOptionCatalog,
  mergeCatalogModels,
  mergeDiscoveredAuthoritativeModels
} from '../../agent-session/options/agent-session-option-catalog'
import type {
  AgentSessionOptionCatalog,
  CatalogModel
} from '../../agent-session/options/agent-session-option-catalog-types'
import type { AgentType } from '../../agent-status/contracts/agent-status-types'
import type { CommitMessageModelCapability } from '../../source-control/ai/generation/commit-message-agent-spec'

export type NativeChatModelDiscoveryResult =
  | {
      success: true
      models: readonly CommitMessageModelCapability[]
      /** Missing only when an older remote runtime produced the response. */
      catalogOrigin?: 'probe' | 'spec'
    }
  | { success: false }

/** The host's CLI model listing as picker models, or null when it cannot stand in for the catalog. */
export function catalogModelsFromModelDiscovery(
  agent: AgentType,
  result: NativeChatModelDiscoveryResult
): CatalogModel[] | null {
  if (
    !result.success ||
    result.models.length === 0 ||
    // Static fallback lists cannot stand in for the host's authoritative inventory.
    ((agent === 'claude' ||
      getNativeChatSessionOptionCatalog(agent)?.discoveredModelsAreAuthoritative) &&
      result.catalogOrigin !== 'probe')
  ) {
    return null
  }
  if (agent === 'antigravity') {
    return groupAntigravityModels(result.models.map(({ id, label }) => ({ id, label })))
  }
  // Discovery prepends a "Config default" sentinel for OpenCode; it is not a model `/models` can pick.
  const listed =
    agent === 'opencode' || agent === 'opencode2'
      ? result.models.filter((model) => model.id !== 'default')
      : result.models
  if (listed.length === 0) {
    return null
  }
  return listed.map((model) => ({
    id: model.id,
    label: model.label,
    ...(model.description ? { description: model.description } : {}),
    ...(model.isDefault ? { isDefault: true as const } : {}),
    ...(model.contextWindowTokens ? { contextWindowTokens: model.contextWindowTokens } : {}),
    ...(model.resolvedModel ? { resolvedModel: model.resolvedModel } : {}),
    options:
      agent === 'claude'
        ? createClaudeCatalogOptions({
            effortLevelIds: model.thinkingLevels?.map(({ id }) => id) ?? [],
            supportsFastMode: model.supportsFastMode
          })
        : agent === 'codex'
          ? createCodexCatalogOptions({
              effortLevelIds: model.thinkingLevels?.map(({ id }) => id) ?? []
            })
          : []
  }))
}

/** Discovered models as the picker lists them: Claude's own, or merged with the seed so its option menus stay. */
export function mergeDiscoveredCatalogModels(
  agent: AgentType,
  catalog: AgentSessionOptionCatalog,
  discovered: readonly CatalogModel[]
): CatalogModel[] {
  if (agent === 'claude') {
    return [...discovered]
  }
  return catalog.discoveredModelsAreAuthoritative
    ? mergeDiscoveredAuthoritativeModels(catalog.models, discovered, catalog.unknownModelOptions)
    : mergeCatalogModels(catalog.models, discovered)
}
