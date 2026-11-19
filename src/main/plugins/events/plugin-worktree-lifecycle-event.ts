import { parseWorkspaceKey } from '../../../shared/workspace/identity/workspace-scope'
import { shortPluginBranchName } from '../../../shared/plugins/events/plugin-events'
import type { RuntimeWorktreeLifecycleEvent } from '../../runtime/workspaces/lifecycle/worktree-lifecycle-event'
import { notifyWorkspaceCreatedPluginHook } from '../hooks/workspace-create-plugin-hook'
import { pluginListedWorkspaceId } from '../workers/host-api/plugin-workspace-projection'
import type { PluginService } from '../plugin-service'

/** The desktop's worktree lifecycle forwarding without its Electron startup module, for orcad. */
export function emitPluginWorktreeLifecycleTo(
  pluginService: Pick<PluginService, 'emitEvent'> | null,
  event: RuntimeWorktreeLifecycleEvent
): void {
  const folder = parseWorkspaceKey(event.worktreeId)?.type === 'folder'
  if (event.kind === 'created') {
    notifyWorkspaceCreatedPluginHook({ ...event, folder })
  }
  // Public worktree events retain their Git-only scope.
  if (folder) {
    return
  }
  const workspaceListId = pluginListedWorkspaceId({
    id: event.worktreeId,
    identityKey: event.identityKey
  })
  const identity = {
    workspaceId: event.worktreeId,
    ...(workspaceListId ? { workspaceListId } : {}),
    kind: 'worktree',
    path: event.path
  }
  pluginService?.emitEvent(
    event.kind === 'created' ? 'workspace.created' : 'workspace.removed',
    event.kind === 'created'
      ? { ...identity, branch: shortPluginBranchName(event.branch) }
      : identity
  )
}
