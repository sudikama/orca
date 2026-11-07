import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'

const mocks = vi.hoisted(() => ({
  current: null as { email: string } | null,
  addCurrent: vi.fn(async () => {
    mocks.accounts.push({ id: 'cur', email: 'cur@x.test' })
    mocks.current = null
  }),
  accounts: [{ id: 'a1', email: 'a@x.test' }] as { id: string; email: string }[],
  fetch: vi.fn(),
  importCredential: vi.fn(async () => undefined)
}))

vi.mock('./native-account-host', () => ({
  getAntigravityAccountService: () => ({
    listAccounts: async () => ({
      accounts: mocks.accounts,
      activeAccountId: mocks.current ? null : 'a1',
      selectedAccountId: null,
      currentAccount: mocks.current
    }),
    credentialsOf: async () => '{"token":{"access_token":"old"}}',
    addCurrentAccount: mocks.addCurrent,
    importCredential: mocks.importCredential
  })
}))
vi.mock('../rate-limits/antigravity-usage-fetcher', () => ({ fetchAntigravityRateLimits: mocks.fetch }))
vi.mock('../runtime/agent-session/environment/structured-agent-shell-environment', () => ({
  hostShellEnvironment: async () => ({ PATH: '/usr/bin' })
}))

const limits = (updatedAt: number): ProviderRateLimits => ({
  provider: 'antigravity',
  session: null,
  weekly: null,
  updatedAt,
  error: null,
  status: 'ok'
})

async function settle(): Promise<void> {
  await vi.waitFor(async () => {
    const { readAntigravityAccountUsage } = await import('./antigravity-account-usage')
    expect((await readAntigravityAccountUsage(false)).usage.every((entry) => !entry.fetching)).toBe(true)
  })
}

describe('readAntigravityAccountUsage', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.fetch.mockReset()
    mocks.importCredential.mockClear()
    mocks.accounts = [{ id: 'a1', email: 'a@x.test' }]
    mocks.current = null
    mocks.addCurrent.mockClear()
  })

  it('saves the login agy already holds so it shows as an account', async () => {
    mocks.accounts = []
    mocks.current = { email: 'cur@x.test' }
    mocks.fetch.mockResolvedValue(limits(Date.now()))
    const { readAntigravityAccountUsage } = await import('./antigravity-account-usage')
    const result = await readAntigravityAccountUsage(false)
    expect(mocks.addCurrent).toHaveBeenCalledTimes(1)
    expect(result.state.accounts.map((account) => account.id)).toEqual(['cur'])
    await settle()
  })

  it('answers at once with a pending read, then serves the cached quota', async () => {
    mocks.fetch.mockResolvedValue(limits(Date.now()))
    const { readAntigravityAccountUsage } = await import('./antigravity-account-usage')
    const first = await readAntigravityAccountUsage(false)
    expect(first.usage).toEqual([{ accountId: 'a1', limits: null, fetching: true }])
    await settle()
    const second = await readAntigravityAccountUsage(false)
    expect(second.usage[0]).toMatchObject({ accountId: 'a1', fetching: false })
    expect(second.usage[0]?.limits?.provider).toBe('antigravity')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('reads again when asked to refresh', async () => {
    mocks.fetch.mockResolvedValue(limits(Date.now()))
    const { readAntigravityAccountUsage } = await import('./antigravity-account-usage')
    await readAntigravityAccountUsage(false)
    await settle()
    await readAntigravityAccountUsage(true)
    await settle()
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps a token that agy renewed during the read', async () => {
    mocks.fetch.mockImplementation(async (options: { resolveEnvironment: () => Promise<NodeJS.ProcessEnv> }) => {
      const env = await options.resolveEnvironment()
      await writeFile(
        join(env.HOME ?? '', '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
        '{"token":{"access_token":"renewed"}}'
      )
      return limits(Date.now())
    })
    const { readAntigravityAccountUsage } = await import('./antigravity-account-usage')
    await readAntigravityAccountUsage(false)
    await settle()
    expect(mocks.importCredential).toHaveBeenCalledWith('{"token":{"access_token":"renewed"}}')
  })

  it('reports a failed read on the account instead of throwing', async () => {
    mocks.fetch.mockRejectedValue(new Error('agy missing'))
    const { readAntigravityAccountUsage } = await import('./antigravity-account-usage')
    await readAntigravityAccountUsage(false)
    await settle()
    const done = await readAntigravityAccountUsage(false)
    expect(done.usage[0]?.limits).toMatchObject({ status: 'error', error: 'agy missing' })
  })
})
