import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSessionFilePath } from './session-file-resolver'

const ID = '7ea3fa52-f333-44b7-9a71-d78e99331b23'
let home: string

function transcript(root: string, id = ID): string {
  const dir = join(root, 'brain', id, '.system_generated', 'logs')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'transcript.jsonl')
  writeFileSync(path, '')
  return path
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orca-agy-resolver-'))
  vi.stubEnv('HOME', home)
  vi.stubEnv('AGYP_ROOT', join(home, 'profiles'))
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(home, { recursive: true, force: true })
})

describe('resolving an Antigravity transcript by conversation id', () => {
  it('reads the active profile', async () => {
    const path = transcript(join(home, '.gemini', 'antigravity-cli'))
    expect(await resolveSessionFilePath('antigravity', ID)).toBe(path)
  })

  it('still finds a conversation after the active profile switched to another account', async () => {
    transcript(join(home, '.gemini', 'antigravity-cli'), 'other-conversation')
    const earlier = transcript(join(home, 'profiles', 'personal'))
    expect(await resolveSessionFilePath('antigravity', ID)).toBe(earlier)
  })

  it('prefers the active profile when two hold the same id', async () => {
    const active = transcript(join(home, '.gemini', 'antigravity-cli'))
    transcript(join(home, 'profiles', 'personal'))
    expect(await resolveSessionFilePath('antigravity', ID)).toBe(active)
  })

  it('finds nothing for an unknown conversation', async () => {
    transcript(join(home, 'profiles', 'personal'), 'someone-else')
    expect(await resolveSessionFilePath('antigravity', ID)).toBeNull()
  })

  it('refuses an id that is not a plain conversation id', async () => {
    transcript(join(home, 'profiles', 'personal'))
    expect(await resolveSessionFilePath('antigravity', '../../etc/passwd')).toBeNull()
    expect(await resolveSessionFilePath('antigravity', `${ID}/..`)).toBeNull()
  })
})
