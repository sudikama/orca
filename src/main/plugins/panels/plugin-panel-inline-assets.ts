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

/** Reads a panel entry with its relative scripts and stylesheets inlined. */
export async function readInlinedPluginPanelEntry(
  rootDir: string,
  entryPath: string,
  maxBytes: number
): Promise<string> {
  const html = await readContainedPluginArtifactText(rootDir, entryPath, maxBytes)
  return inlinePluginPanelAssets(rootDir, entryPath, html, maxBytes)
}

/** Inlines the entry's relative scripts and stylesheets, within one shared byte budget. */
export async function inlinePluginPanelAssets(
  rootDir: string,
  entryPath: string,
  html: string,
  maxBytes: number
): Promise<string> {
  let budget = maxBytes - Buffer.byteLength(html)
  let count = 0
  const read = async (reference: string): Promise<string | null> => {
    const path = containedAssetPath(entryPath, reference)
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
  const withScripts = await replaceAsync(html, SCRIPT_SRC, async (match, groups) => {
    const [before, , src, after] = groups
    const text = await read(src)
    const attrs = `${before} ${after}`.trim()
    return text === null
      ? match
      : `<script${attrs ? ` ${attrs}` : ''}>${text.replace(/<\/script/gi, '<\\/script')}</script>`
  })
  return replaceAsync(withScripts, STYLESHEET_LINK, async (match) => {
    const href = REL_STYLESHEET.test(match) ? HREF.exec(match)?.[2] : undefined
    if (href === undefined) {
      return match
    }
    const text = await read(href)
    return text === null ? match : `<style>${text.replace(/<\/style/gi, '<\\/style')}</style>`
  })
}
