import type { RuntimeWorktreePsSummary } from '../../../../shared/runtime-worktree-contracts'

export const AUTO_SLEEP_DEFAULT_IDLE_MS = 30 * 60_000
const AUTO_SLEEP_MIN_IDLE_MS = 60_000
const AUTO_SLEEP_MAX_IDLE_MS = 24 * 60 * 60_000
const CHECK_INTERVAL_MS = 60_000
// A failed sleep is retried later, not on the next minute's pass.
const FAILURE_BACKOFF_MS = 10 * 60_000

export type AutoSleepRuntime = {
  getWorktreePs(limit?: number): Promise<{ worktrees: readonly RuntimeWorktreePsSummary[] }>
  sleepManagedWorktree(selector: string, opts: { markChatsAsleep: boolean }): Promise<unknown>
  /** When a phone last opened each workspace; opening one counts as activity. */
  readonly workspaceReopenedAt: ReadonlyMap<string, number>
}

/** The idle window from `ORCA_AUTO_SLEEP_MINUTES`; null leaves auto sleep off. */
export function autoSleepIdleMsFromEnv(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') {
    return null
  }
  const minutes = Number(value)
  const ms = minutes * 60_000
  return Number.isFinite(ms) && ms >= AUTO_SLEEP_MIN_IDLE_MS && ms <= AUTO_SLEEP_MAX_IDLE_MS
    ? ms
    : null
}

/** The last moment anything happened in the workspace, or null when the host cannot tell. */
function lastActivityAt(
  summary: RuntimeWorktreePsSummary,
  reopenedAt: number | undefined
): number | null {
  const stamps = [
    summary.lastOutputAt,
    reopenedAt ?? null,
    ...summary.agents.flatMap((agent) => [agent.updatedAt, agent.stateStartedAt])
  ].filter((stamp): stamp is number => typeof stamp === 'number' && stamp > 0)
  return stamps.length > 0 ? Math.max(...stamps) : null
}

/**
 * Whether a workspace should sleep: it runs agents, every one of them has finished its turn,
 * and nothing has happened for the idle window. A working or waiting agent is never put to sleep.
 */
export function isWorkspaceIdleForSleep(
  summary: RuntimeWorktreePsSummary,
  now: number,
  idleMs: number,
  reopenedAt?: number
): boolean {
  if (summary.liveTerminalCount === 0 || summary.agents.length === 0) {
    return false
  }
  if (summary.agents.some((agent) => agent.state !== 'done')) {
    return false
  }
  if (summary.status === 'working' || summary.status === 'permission') {
    return false
  }
  const last = lastActivityAt(summary, reopenedAt)
  return last !== null && now - last >= idleMs
}

/**
 * Sleeps idle agent workspaces on a headless host, which has no window to do it. A phone that opens
 * the workspace again wakes it through the existing activation path, so nothing here resumes.
 */
export class WorkspaceAutoSleep {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private readonly retryAfter = new Map<string, number>()

  constructor(
    private readonly runtime: AutoSleepRuntime,
    private readonly idleMs: number,
    private readonly now: () => number = Date.now,
    private readonly log: (message: string) => void = (message) => console.info(message),
    /** Log what would sleep and leave every workspace running. */
    private readonly dryRun = false
  ) {}

  start(): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
    // The check must not keep a stopping server alive.
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** One pass; passes never overlap, and one workspace's failure leaves the others alone. */
  async check(): Promise<string[]> {
    if (this.running) {
      return []
    }
    this.running = true
    const slept: string[] = []
    try {
      const { worktrees } = await this.runtime.getWorktreePs()
      const now = this.now()
      for (const summary of worktrees) {
        const id = summary.worktreeId
        if ((this.retryAfter.get(id) ?? 0) > now) {
          continue
        }
        if (!isWorkspaceIdleForSleep(summary, now, this.idleMs, this.runtime.workspaceReopenedAt.get(id))) {
          continue
        }
        if (this.dryRun) {
          this.log(`[auto-sleep] dry run: would sleep ${summary.displayName || id}`)
          continue
        }
        try {
          await this.runtime.sleepManagedWorktree(`id:${id}`, { markChatsAsleep: true })
          slept.push(id)
          this.log(`[auto-sleep] slept idle workspace ${summary.displayName || id}`)
        } catch (error) {
          this.retryAfter.set(id, now + FAILURE_BACKOFF_MS)
          this.log(
            `[auto-sleep] could not sleep ${summary.displayName || id}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    } catch (error) {
      this.log(`[auto-sleep] check failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.running = false
    }
    return slept
  }
}
