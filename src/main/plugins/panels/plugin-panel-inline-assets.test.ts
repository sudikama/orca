import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { containedAssetPath, inlinePluginPanelAssets } from './plugin-panel-inline-assets'

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
})
