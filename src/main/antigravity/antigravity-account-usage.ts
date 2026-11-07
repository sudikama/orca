import { chmod, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AntigravityAccountUsageState
} from '../../shared/antigravity-account-types'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import { fetchAntigravityRateLimits } from '../rate-limits/antigravity-usage-fetcher'
import { hostShellEnvironment } from '../runtime/agent-session/environment/structured-agent-shell-environment'
import { getAntigravityAccountService } from './native-account-host'

// agy answers a quota read in a few seconds; a short cache keeps the phone's polling cheap.
const FRESH_MS = 5 * 60_000

const cache = new Map<string, ProviderRateLimits>()
const inflight = new Set<string>()
// One agy at a time: each read starts a process and may refresh a token.
let queue: Promise<void> = Promise.resolve()

function failure(message: string): ProviderRateLimits {
  return {
    provider: 'antigravity',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error: message,
    status: 'error'
  }
}

/** Reads one saved account's quota by running agy on a private copy of its login. */
async function readAccount(id: string): Promise<ProviderRateLimits> {
  if (process.platform !== 'linux') {
    return failure('Per-account Antigravity usage needs a Linux host.')
  }
  const service = getAntigravityAccountService({ runtime: 'host' })
  const contents = await service.credentialsOf(id)
  const home = await mkdtemp(join(tmpdir(), 'orca-agy-usage-'))
  try {
    const dir = join(home, '.gemini', 'antigravity-cli')
    const tokenPath = join(dir, 'antigravity-oauth-token')
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await writeFile(tokenPath, contents, { mode: 0o600 })
    await chmod(tokenPath, 0o600)
    const limits = await fetchAntigravityRateLimits({
      resolveEnvironment: async () => {
        const env: NodeJS.ProcessEnv = { ...(await hostShellEnvironment()), HOME: home }
        // A desktop keyring would answer for the host's own login instead of this copy.
        delete env.DBUS_SESSION_BUS_ADDRESS
        return env
      }
    })
    // agy renews an expired access token in place; keep the renewal or the next read starts stale.
    const after = await readFile(tokenPath, 'utf8').catch(() => contents)
    if (after !== contents) {
      await service.importCredential(after).catch(() => undefined)
    }
    return limits
  } finally {
    await rm(home, { recursive: true, force: true }).catch(() => undefined)
  }
}

function schedule(id: string): void {
  if (inflight.has(id)) {
    return
  }
  inflight.add(id)
  queue = queue
    .then(async () => {
      cache.set(id, await readAccount(id).catch((error: unknown) =>
        failure(error instanceof Error ? error.message : String(error))
      ))
    })
    .finally(() => inflight.delete(id))
}

/** The saved accounts with the quota last read for each; stale or missing quota is read in the background. */
export async function readAntigravityAccountUsage(
  refresh: boolean
): Promise<AntigravityAccountUsageState> {
  const service = getAntigravityAccountService({ runtime: 'host' })
  let state = await service.listAccounts()
  // The login agy already holds becomes a saved account, so it shows beside the ones added later.
  if (state.currentAccount && state.activeAccountId === null) {
    state = await service
      .addCurrentAccount()
      .then(() => service.listAccounts())
      .catch(() => state)
  }
  const known = new Set(state.accounts.map((account) => account.id))
  for (const id of cache.keys()) {
    if (!known.has(id)) {
      cache.delete(id)
    }
  }
  for (const account of state.accounts) {
    const hit = cache.get(account.id)
    if (refresh || !hit || Date.now() - hit.updatedAt > FRESH_MS) {
      schedule(account.id)
    }
  }
  return {
    state,
    usage: state.accounts.map((account) => ({
      accountId: account.id,
      limits: cache.get(account.id) ?? null,
      fetching: inflight.has(account.id)
    }))
  }
}
