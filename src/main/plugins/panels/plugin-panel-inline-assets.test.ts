import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  containedAssetPath,
  inlinePluginPanelAssets,
  PANEL_MODULE_PREFIX,
  readInlinedPluginPanelEntry,
  withPanelModuleScripts
} from './plugin-panel-inline-assets'

describe('containedAssetPath', () => {
  it('resolves siblings of the entry and refuses anything outside the plugin', () => {
    expect(containedAssetPath('panel/index.html', 'app.js')).toBe('panel/app.js')
    expect(containedAssetPath('panel/index.html', './lib/x.js?v=2')).toBe('panel/lib/x.js')
    expect(containedAssetPath('panel/index.html', '../shared/y.css')).toBe('shared/y.css')
    expect(containedAssetPath('panel/index.html', '../../etc/passwd')).toBeNull()
    expect(containedAssetPath('panel/index.html', 'https://cdn.example/x.js')).toBeNull()
    expect(containedAssetPath('panel/index.html', '//cdn.example/x.js')).toBeNull()
    expect(containedAssetPath('panel/index.html', '/abs.js')).toBeNull()
    expect(containedAssetPath('panel/index.html', 'data:text/javascript,1')).toBeNull()
  })
})

describe('inlinePluginPanelAssets', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-panel-inline-'))
    await mkdir(join(root, 'panel'))
    await writeFile(join(root, 'panel', 'app.js'), 'window.x = "</script>"')
    await writeFile(join(root, 'panel', 'style.css'), 'body{color:red}')
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('inlines relative scripts and stylesheets in place', async () => {
    const html =
      '<head><link rel="stylesheet" href="style.css" /></head>' +
      '<body><script src="app.js"></script></body>'
    const out = await inlinePluginPanelAssets(root, 'panel/index.html', html, 1024 * 1024)
    expect(out).toBe(
      '<head><style>body{color:red}</style></head>' +
        '<body><script>window.x = "<\\/script>"</script></body>'
    )
  })

  it('keeps remote, missing and over-budget references untouched', async () => {
    const html =
      '<script src="https://cdn.example/x.js"></script><script src="missing.js"></script>' +
      '<link rel="icon" href="style.css"><script src="app.js"></script>'
    expect(await inlinePluginPanelAssets(root, 'panel/index.html', html, html.length + 5)).toBe(
      html
    )
  })

  it('turns an ES module graph into one import map of data: modules', async () => {
    await mkdir(join(root, 'panel', 'assets'))
    await writeFile(
      join(root, 'panel', 'assets', 'app.js'),
      'export const a = 1; const lazy = () => import(`./sections.js`)'
    )
    await writeFile(
      join(root, 'panel', 'assets', 'sections.js'),
      'import { a } from "./app.js"; export default a'
    )
    const html = '<head><script type="module" crossorigin src="./assets/app.js"></script></head>'
    const out = await inlinePluginPanelAssets(root, 'panel/index.html', html, 1024 * 1024)
    const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(out)?.[1] ?? '{}')
    const decode = (key: string) =>
      Buffer.from(map.imports[key].split(',')[1], 'base64').toString('utf8')
    expect(Object.keys(map.imports)).toEqual([
      `${PANEL_MODULE_PREFIX}panel/assets/app.js`,
      `${PANEL_MODULE_PREFIX}panel/assets/sections.js`
    ])
    expect(decode(`${PANEL_MODULE_PREFIX}panel/assets/app.js`)).toContain(
      `import(\`${PANEL_MODULE_PREFIX}panel/assets/sections.js\`)`
    )
    expect(decode(`${PANEL_MODULE_PREFIX}panel/assets/sections.js`)).toContain(
      `from "${PANEL_MODULE_PREFIX}panel/assets/app.js"`
    )
    expect(out).toContain(
      `<script type="module">import "${PANEL_MODULE_PREFIX}panel/assets/app.js"</script>`
    )
    expect(out.indexOf('type="importmap"')).toBeLessThan(out.indexOf('type="module"'))
  })

  it('opens data: scripts in the shell CSP only for inlined modules', () => {
    const csp = "script-src 'unsafe-inline'; style-src 'unsafe-inline'"
    expect(withPanelModuleScripts(`${csp}<script>x</script>`)).toBe(`${csp}<script>x</script>`)
    expect(withPanelModuleScripts(`${csp}import "${PANEL_MODULE_PREFIX}a.js"`)).toContain(
      "script-src 'unsafe-inline' data:;"
    )
  })

  it('prefixes the entry with the storage fallback', async () => {
    await writeFile(join(root, 'panel', 'index.html'), '<body></body>')
    const out = await readInlinedPluginPanelEntry(root, 'panel/index.html', 1024 * 1024)
    expect(out.startsWith('<script>')).toBe(true)
    expect(out).toContain("['localStorage','sessionStorage']")
    expect(out.endsWith('<body></body>')).toBe(true)
  })
})
