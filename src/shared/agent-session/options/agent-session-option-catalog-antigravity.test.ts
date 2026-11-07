import { describe, expect, it } from 'vitest'
import {
  ANTIGRAVITY_SESSION_OPTION_CATALOG,
  groupAntigravityModels,
  parseAntigravityCatalogModels
} from './agent-session-option-catalog-antigravity'
import { createNativeChatPtySessionOptions } from '../../native-chat/input/native-chat-pty-session-options'
import { catalogModelsFromModelDiscovery } from '../../native-chat/input/native-chat-discovered-catalog-models'

const LISTING = [
  'Fetching available models...',
  'gemini-4-argon-medium\tGemini 4 Argon (Medium)',
  'gemini-4-argon-high\tGemini 4 Argon (High)',
  'gemini-4-argon-low\tGemini 4 Argon (Low)',
  'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
  'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)',
  'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)',
  ''
].join('\n')

describe('antigravity model listing', () => {
  it('groups effort slugs into one row per family with ordered effort levels', () => {
    const models = parseAntigravityCatalogModels(LISTING)
    expect(models.map((m) => [m.id, m.label])).toEqual([
      ['gemini-4-argon', 'Gemini 4 Argon'],
      ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
      ['gpt-oss-120b-medium', 'GPT-OSS 120B']
    ])
    const argon = models[0].options[0]
    expect(argon.kind.type === 'select' && argon.kind.choices.map((c) => c.value)).toEqual([
      'low',
      'medium',
      'high'
    ])
    expect(argon.kind.type === 'select' && argon.kind.defaultValue).toBe('medium')
    // A lone level has nothing to choose, so it keeps its own slug and no effort control.
    expect(models[2].options).toEqual([])
  })

  it('keeps unsuffixed ids as their own model', () => {
    expect(groupAntigravityModels([{ id: 'auto', label: 'Auto' }])).toEqual([
      { id: 'auto', label: 'Auto', options: [] }
    ])
  })

  it('maps the host discovery result the same way', () => {
    const models = catalogModelsFromModelDiscovery('antigravity', {
      success: true,
      catalogOrigin: 'probe',
      models: [
        { id: 'a-low', label: 'A (Low)' },
        { id: 'a-high', label: 'A (High)' }
      ]
    })
    expect(models?.map((m) => m.id)).toEqual(['a'])
  })

  it('refuses a static fallback list as the account inventory', () => {
    expect(
      catalogModelsFromModelDiscovery('antigravity', {
        success: true,
        catalogOrigin: 'spec',
        models: [{ id: 'a-low', label: 'A (Low)' }]
      })
    ).toBeNull()
  })

  it('sends model and effort as slash commands mid-session', async () => {
    const sent: string[] = []
    const surface = createNativeChatPtySessionOptions({
      agent: 'antigravity',
      scopeKey: 'agy-test',
      mode: 'live',
      modelLabel: 'Model',
      initialModels: parseAntigravityCatalogModels(LISTING),
      dispatchCommand: async (command) => {
        sent.push(command)
      }
    })!
    await surface.setOption('model', 'gemini-4-argon')
    const effort = surface.getSnapshot().find((d) => d.id === 'effort')
    expect(effort?.settable).toBe(true)
    await surface.setOption('effort', 'high')
    expect(sent).toEqual(['/model gemini-4-argon', '/effort high'])
    expect(ANTIGRAVITY_SESSION_OPTION_CATALOG.modelApply.midSession?.kind).toBe('command')
  })
})
