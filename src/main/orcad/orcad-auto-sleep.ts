import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  autoSleepIdleMsFromEnv,
  WorkspaceAutoSleep
} from '../runtime/workspaces/sleep/workspace-auto-sleep'

/** Starts sleeping idle agent workspaces when `ORCA_AUTO_SLEEP_MINUTES` is set; the desktop window does it elsewhere. */
export function startOrcadAutoSleep(
  runtime: OrcaRuntimeService,
  registerCleanup: (cleanup: () => void) => void,
  env: NodeJS.ProcessEnv = process.env
): void {
  const idleMs = autoSleepIdleMsFromEnv(env.ORCA_AUTO_SLEEP_MINUTES)
  if (idleMs === null) {
    return
  }
  const dryRun = env.ORCA_AUTO_SLEEP_DRY_RUN === '1'
  const service = new WorkspaceAutoSleep(runtime, idleMs, Date.now, undefined, dryRun)
  registerCleanup(() => service.stop())
  service.start()
  console.info(
    `[auto-sleep] ${dryRun ? 'dry run: reporting' : 'sleeping'} agent workspaces idle for ${Math.round(idleMs / 60_000)} min`
  )
}
