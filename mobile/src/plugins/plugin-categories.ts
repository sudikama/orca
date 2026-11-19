// Fork: the desktop's plugin kinds (src/renderer/src/components/plugins/list/plugin-list-filter.ts),
// restated so the phone groups the marketplace the same way. Keep the tables in sync.

type Translate = (key: string, fallback: string) => string

// "official" is trust, shown elsewhere; it is not a kind of plugin.
const NON_KIND_CATEGORIES = new Set(['official'])

const KIND_BY_CATEGORY: Readonly<Record<string, string>> = {
  themes: 'themes',
  'app-themes': 'themes',
  'terminal-themes': 'themes',
  icons: 'icons',
  'icon-themes': 'icons',
  languages: 'languages',
  syntax: 'languages',
  syntaxes: 'languages',
  'language-packs': 'translations',
  localization: 'translations',
  i18n: 'translations',
  translations: 'translations',
  editors: 'editors',
  'file-viewers': 'editors',
  keybindings: 'commands',
  commands: 'commands',
  panels: 'commands',
  'vm-recipes': 'machines',
  machines: 'machines',
  recipes: 'machines',
  games: 'games'
}

const KIND_BY_TYPE: Readonly<Record<string, string>> = {
  'app-theme': 'themes',
  'terminal-theme': 'themes',
  'icon-theme': 'icons',
  syntax: 'languages',
  'interface-language': 'translations',
  instructions: 'commands',
  panel: 'commands',
  editor: 'editors',
  worker: 'commands'
}

const KIND_ORDER = [
  'themes',
  'languages',
  'translations',
  'icons',
  'editors',
  'commands',
  'machines',
  'games'
]

/** A plugin's kinds: its catalog categories folded into known kinds, else its contributed types. */
export function pluginKinds(categories: readonly string[], types: readonly string[] = []): string[] {
  const kinds = new Set<string>()
  for (const category of categories) {
    if (!NON_KIND_CATEGORIES.has(category)) {
      kinds.add(KIND_BY_CATEGORY[category] ?? category)
    }
  }
  if (kinds.size === 0) {
    for (const type of types) {
      const kind = KIND_BY_TYPE[type]
      if (kind) {
        kinds.add(kind)
      }
    }
  }
  return [...kinds]
}

/** Kinds present with their counts: known kinds in the desktop's order, then the rest by name. */
export function pluginKindCounts(lists: readonly (readonly string[])[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const kinds of lists) {
    for (const kind of kinds) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
    }
  }
  const rank = (kind: string): number => {
    const index = KIND_ORDER.indexOf(kind)
    return index === -1 ? KIND_ORDER.length : index
  }
  return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
}

export function pluginKindLabel(kind: string, t: Translate): string {
  switch (kind) {
    case 'themes':
      return t('plugins.kind.themes', 'Themes')
    case 'languages':
      return t('plugins.kind.languages', 'Languages')
    case 'translations':
      return t('plugins.kind.translations', 'Translations')
    case 'icons':
      return t('plugins.kind.icons', 'Icons')
    case 'editors':
      return t('plugins.kind.editors', 'Editors')
    case 'commands':
      return t('plugins.kind.commands', 'Commands & panels')
    case 'machines':
      return t('plugins.kind.machines', 'Remote/VMs')
    case 'games':
      return t('plugins.kind.games', 'Games')
    case 'agents':
      return t('plugins.kind.agents', 'Agents')
    case 'integrations':
      return t('plugins.kind.integrations', 'Integrations')
    default:
      return kind
        .split('-')
        .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
        .join(' ')
  }
}
