import { posix } from 'node:path'
import { readContainedPluginArtifactText } from '../artifacts/plugin-contained-artifact'

// Fork: the srcdoc panel shell's CSP allows inline scripts and styles only, so a panel whose
// entry loads sibling files (`<script src="app.js">`, `<link rel="stylesheet" href="style.css">`)
// renders blank there (the phone, and the desktop srcdoc fallback). Inline those files from the
// plugin's own directory; anything remote, absolute or unreadable is left as it was.

const SCRIPT_SRC = /<script\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi
const STYLESHEET_LINK = /<link\b[^>]*>/gi
const REL_STYLESHEET = /\brel\s*=\s*(["'])\s*stylesheet\s*\1/i
const HREF = /\bhref\s*=\s*(["'])([^"']+)\1/i
const MAX_INLINED_ASSETS = 64

/** Resolves a reference against the entry's directory; null for anything outside the plugin. */
export function containedAssetPath(entryPath: string, reference: string): string | null {
  const ref = reference.trim()
  if (
    ref === '' ||
    /^[a-z][a-z0-9+.-]*:/i.test(ref) ||
    ref.startsWith('//') ||
    ref.startsWith('/')
  ) {
    return null
  }
  const clean = ref.split(/[?#]/, 1)[0]
  const resolved = posix.normalize(posix.join(posix.dirname(entryPath), clean))
  return resolved.startsWith('../') || resolved === '..' ? null : resolved
}

async function replaceAsync(
  input: string,
  pattern: RegExp,
  replacer: (match: string, groups: string[]) => Promise<string>
): Promise<string> {
  const parts: string[] = []
  let last = 0
  // Sequential on purpose: the shared byte budget is charged in document order.
  for (const match of input.matchAll(pattern)) {
    const index = match.index ?? 0
    parts.push(input.slice(last, index), await replacer(match[0], match.slice(1)))
    last = index + match[0].length
  }
  parts.push(input.slice(last))
  return parts.join('')
}

// The srcdoc frame has an opaque origin, where touching localStorage throws and kills a panel
// that never guarded it. Swap in per-open, in-memory storage only when the real one is refused.
const PANEL_STORAGE_SHIM =
  '<script>(function(){function m(){var d=new Map();return{get length(){return d.size},' +
  'key:function(i){return Array.from(d.keys())[i]??null},getItem:function(k){k=String(k);' +
  'return d.has(k)?d.get(k):null},setItem:function(k,v){d.set(String(k),String(v))},' +
  'removeItem:function(k){d.delete(String(k))},clear:function(){d.clear()}}}' +
  "['localStorage','sessionStorage'].forEach(function(n){try{window[n].length}catch(e){" +
  'try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(e2){}}})})()</script>\n'

/** Reads a panel entry with its relative scripts and stylesheets inlined. */
export async function readInlinedPluginPanelEntry(
  rootDir: string,
  entryPath: string,
  maxBytes: number
): Promise<string> {
  const html = await readContainedPluginArtifactText(rootDir, entryPath, maxBytes)
  return PANEL_STORAGE_SHIM + (await inlinePluginPanelAssets(rootDir, entryPath, html, maxBytes))
}

/** Bare specifier prefix the import map resolves; a panel's own module graph lives under it. */
export const PANEL_MODULE_PREFIX = 'orca-panel-module/'
const IMPORTMAP_SLOT = '<!--orca-panel-importmap-->'
const MODULE_TYPE = /\btype\s*=\s*(["'])module\1/i
// A relative module specifier in quotes or backticks: `import("./chunk.js")`, `from"./app.js"`.
const RELATIVE_SPECIFIER = /(["'`])(\.{1,2}\/[\w.\-/]+\.m?js)\1/g

/** Inlines the entry's relative scripts and stylesheets, within one shared byte budget. An ES
 *  module graph (Vite-style chunks importing each other by relative path) becomes data: modules
 *  behind an import map, so every chunk keeps one instance and dynamic imports still resolve. */
export async function inlinePluginPanelAssets(
  rootDir: string,
  entryPath: string,
  html: string,
  maxBytes: number
): Promise<string> {
  let budget = maxBytes - Buffer.byteLength(html)
  let count = 0
  const readPath = async (path: string | null): Promise<string | null> => {
    if (path === null || count >= MAX_INLINED_ASSETS || budget <= 0) {
      return null
    }
    count += 1
    try {
      const text = await readContainedPluginArtifactText(rootDir, path, budget)
      budget -= Buffer.byteLength(text)
      return text
    } catch {
      return null
    }
  }
  const read = (reference: string) => readPath(containedAssetPath(entryPath, reference))
  const modules = new Map<string, string>()
  // Loads one module and every relative module it names, rewriting those names to bare ones.
  const loadModule = async (path: string): Promise<boolean> => {
    if (modules.has(path)) {
      return true
    }
    const source = await readPath(path)
    if (source === null) {
      return false
    }
    modules.set(path, '')
    const targets = new Map<string, string | null>()
    for (const match of source.matchAll(RELATIVE_SPECIFIER)) {
      const target = containedAssetPath(path, match[2])
      targets.set(match[2], target !== null && (await loadModule(target)) ? target : null)
    }
    const rewritten = source.replace(RELATIVE_SPECIFIER, (whole, quote: string, spec: string) => {
      const target = targets.get(spec)
      return target ? `${quote}${PANEL_MODULE_PREFIX}${target}${quote}` : whole
    })
    modules.set(path, rewritten)
    return true
  }
  const withScripts = await replaceAsync(html, SCRIPT_SRC, async (match, groups) => {
    const [before, , src, after] = groups
    const attrs = `${before} ${after}`.trim()
    if (MODULE_TYPE.test(attrs)) {
      const path = containedAssetPath(entryPath, src)
      const slot = modules.size === 0 ? IMPORTMAP_SLOT : ''
      return path !== null && (await loadModule(path))
        ? `${slot}<script type="module">import ${JSON.stringify(PANEL_MODULE_PREFIX + path)}</script>`
        : match
    }
    const text = await read(src)
    return text === null
      ? match
      : `<script${attrs ? ` ${attrs}` : ''}>${text.replace(/<\/script/gi, '<\\/script')}</script>`
  })
  const imports = Object.fromEntries(
    [...modules].map(([path, source]) => [
      PANEL_MODULE_PREFIX + path,
      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    ])
  )
  const withModules = withScripts.replace(
    IMPORTMAP_SLOT,
    modules.size === 0 ? '' : `<script type="importmap">${JSON.stringify({ imports })}</script>`
  )
  return replaceAsync(withModules, STYLESHEET_LINK, async (match) => {
    const href = REL_STYLESHEET.test(match) ? HREF.exec(match)?.[2] : undefined
    if (href === undefined) {
      return match
    }
    const text = await read(href)
    return text === null ? match : `<style>${text.replace(/<\/style/gi, '<\\/style')}</style>`
  })
}

/** The srcdoc shell allows inline scripts only; a panel whose modules were inlined as data:
 *  modules also needs `data:` scripts. Network stays closed (`connect-src 'none'`). */
export function withPanelModuleScripts(shellHtml: string): string {
  return shellHtml.includes(`"${PANEL_MODULE_PREFIX}`)
    ? shellHtml.replace("script-src 'unsafe-inline';", "script-src 'unsafe-inline' data:;")
    : shellHtml
}
