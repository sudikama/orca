import { describe, expect, it } from 'vitest'
import { getNativeChatSessionOptionCatalog } from './agent-session-option-catalog'
import { createNativeChatPtySessionOptions } from '../../native-chat/input/native-chat-pty-session-options'
import {
  catalogModelsFromModelDiscovery,
  mergeDiscoveredCatalogModels
} from '../../native-chat/input/native-chat-discovered-catalog-models'

describe('opencode chat option catalog', () => {
  it('is used for opencode chats only, leaving the launch catalog alone', () => {
    expect(getNativeChatSessionOptionCatalog('opencode')?.listModels?.command).toBe(
      'opencode models'
    )
    expect(getNativeChatSessionOptionCatalog('opencode2')).not.toBeNull()
    expect(getNativeChatSessionOptionCatalog('claude')?.models.length).toBeGreaterThan(0)
  })

  it('parses provider/model lines and skips noise', () => {
    const catalog = getNativeChatSessionOptionCatalog('opencode')!
    expect(
      catalog
        .listModels!.parse('opencode-go/glm-5.2\nwarning: slow\n\nopenai/gpt-5.5\n')
        .map((m) => m.id)
    ).toEqual(['opencode-go/glm-5.2', 'openai/gpt-5.5'])
  })

  it('gives every discovered model the thinking-effort control', () => {
    const catalog = getNativeChatSessionOptionCatalog('opencode')!
    const discovered = catalogModelsFromModelDiscovery('opencode', {
      success: true,
      catalogOrigin: 'probe',
      models: [{ id: 'opencode-go/glm-5.2', label: 'opencode-go/glm-5.2' }]
    })!
    const merged = mergeDiscoveredCatalogModels('opencode', catalog, discovered)
    expect(merged[0].options.map((o) => o.id)).toEqual(['variant'])
  })

  it('drops the Config default sentinel from the discovered list', () => {
    const models = catalogModelsFromModelDiscovery('opencode', {
      success: true,
      catalogOrigin: 'probe',
      models: [
        { id: 'default', label: 'Config default' },
        { id: 'p/m', label: 'p/m' }
      ]
    })
    expect(models?.map((m) => m.id)).toEqual(['p/m'])
  })

  it('opens opencode pickers in the terminal instead of guessing a value', async () => {
    const sent: string[] = []
    let picker = 0
    const surface = createNativeChatPtySessionOptions({
      agent: 'opencode',
      scopeKey: 'oc-test',
      mode: 'live',
      modelLabel: 'Model',
      initialModels: [{ id: 'p/m', label: 'p/m', options: [] }],
      dispatchCommand: async (command) => {
        sent.push(command)
      },
      onAgentPicker: () => {
        picker += 1
      }
    })!
    const model = surface.getSnapshot().find((d) => d.id === 'model')
    expect(model?.action).toEqual({ type: 'agent-picker' })
    await surface.invokeAction('model')
    expect(sent).toEqual(['/models'])
    expect(picker).toBe(1)
  })
})
