import { describe, expect, it, vi } from 'vitest'
import type { RuntimeWorktreePsSummary } from '../../../../shared/runtime-worktree-contracts'
import {
  autoSleepIdleMsFromEnv,
  isWorkspaceIdleForSleep,
  WorkspaceAutoSleep
} from './workspace-auto-sleep'

const MIN = 60_000
const NOW = 10_000 * MIN

function agent(state: string, updatedAt: number) {
  return { paneKey: 'p', state, updatedAt, stateStartedAt: updatedAt }
}

function workspace(over: Record<string, unknown> = {}): RuntimeWorktreePsSummary {
  // The summary has many fields; the check reads only these.
  return {
    worktreeId: 'w1',
    displayName: 'one',
    liveTerminalCount: 1,
    lastOutputAt: NOW - 40 * MIN,
    status: 'done',
    agents: [agent('done', NOW - 45 * MIN)],
    ...over
  } as unknown as RuntimeWorktreePsSummary
}

describe('autoSleepIdleMsFromEnv', () => {
  it('reads minutes and ignores unusable values', () => {
    expect(autoSleepIdleMsFromEnv('30')).toBe(30 * MIN)
    expect(autoSleepIdleMsFromEnv(undefined)).toBeNull()
    expect(autoSleepIdleMsFromEnv('')).toBeNull()
    expect(autoSleepIdleMsFromEnv('abc')).toBeNull()
    expect(autoSleepIdleMsFromEnv('0')).toBeNull()
    expect(autoSleepIdleMsFromEnv('99999')).toBeNull()
  })
})

describe('isWorkspaceIdleForSleep', () => {
  it('sleeps a finished agent workspace after the idle window', () => {
    expect(isWorkspaceIdleForSleep(workspace(), NOW, 30 * MIN)).toBe(true)
  })

  it('waits while anything happened inside the window', () => {
    expect(isWorkspaceIdleForSleep(workspace({ lastOutputAt: NOW - 5 * MIN }), NOW, 30 * MIN)).toBe(false)
    expect(isWorkspaceIdleForSleep(workspace(), NOW, 30 * MIN, NOW - 2 * MIN)).toBe(false)
  })

  it('never sleeps a working, blocked or waiting agent', () => {
    for (const state of ['working', 'blocked', 'waiting']) {
      expect(
        isWorkspaceIdleForSleep(workspace({ agents: [agent(state, NOW - 90 * MIN)] }), NOW, 30 * MIN)
      ).toBe(false)
    }
    expect(isWorkspaceIdleForSleep(workspace({ status: 'working' }), NOW, 30 * MIN)).toBe(false)
  })

  it('leaves plain shells and empty workspaces alone', () => {
    expect(isWorkspaceIdleForSleep(workspace({ agents: [] }), NOW, 30 * MIN)).toBe(false)
    expect(isWorkspaceIdleForSleep(workspace({ liveTerminalCount: 0 }), NOW, 30 * MIN)).toBe(false)
  })

  it('does not guess when the host has no timestamps', () => {
    expect(
      isWorkspaceIdleForSleep(
        workspace({ lastOutputAt: null, agents: [{ paneKey: 'p', state: 'done', updatedAt: 0, stateStartedAt: 0 }] }),
        NOW,
        30 * MIN
      )
    ).toBe(false)
  })
})

describe('WorkspaceAutoSleep.check', () => {
  function setup(
    worktrees: RuntimeWorktreePsSummary[],
    sleep: (selector: string, opts: { markChatsAsleep: boolean }) => Promise<unknown> = vi.fn(
      async () => undefined
    )
  ) {
    const runtime = {
      getWorktreePs: async () => ({ worktrees }),
      sleepManagedWorktree: sleep,
      workspaceReopenedAt: new Map<string, number>()
    }
    const logs: string[] = []
    const service = new WorkspaceAutoSleep(runtime, 30 * MIN, () => NOW, (line) => logs.push(line))
    return { service, sleep, runtime, logs }
  }

  it('sleeps only the idle workspaces', async () => {
    const { service, sleep } = setup([
      workspace(),
      workspace({ worktreeId: 'w2', lastOutputAt: NOW - MIN, agents: [agent('done', NOW - MIN)] })
    ])
    expect(await service.check()).toEqual(['w1'])
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith('id:w1', { markChatsAsleep: true })
  })

  it('backs off after a failed sleep and keeps going with the others', async () => {
    const sleep = vi.fn(async (selector: string) => {
      if (selector === 'id:w1') {
        throw new Error('stop unproven')
      }
    })
    const { service, logs } = setup([workspace(), workspace({ worktreeId: 'w2' })], sleep)
    expect(await service.check()).toEqual(['w2'])
    expect(logs.some((line) => line.includes('stop unproven'))).toBe(true)
    sleep.mockClear()
    expect(await service.check()).toEqual(['w2'])
    expect(sleep).not.toHaveBeenCalledWith('id:w1', expect.anything())
  })

  it('counts a phone opening the workspace as activity', async () => {
    const { service, runtime, sleep } = setup([workspace()])
    runtime.workspaceReopenedAt.set('w1', NOW - 3 * MIN)
    expect(await service.check()).toEqual([])
    expect(sleep).not.toHaveBeenCalled()
  })

  it('only reports in a dry run', async () => {
    const sleep = vi.fn(async () => undefined)
    const runtime = {
      getWorktreePs: async () => ({ worktrees: [workspace()] }),
      sleepManagedWorktree: sleep,
      workspaceReopenedAt: new Map<string, number>()
    }
    const logs: string[] = []
    const service = new WorkspaceAutoSleep(runtime, 30 * MIN, () => NOW, (line) => logs.push(line), true)
    expect(await service.check()).toEqual([])
    expect(sleep).not.toHaveBeenCalled()
    expect(logs[0]).toContain('dry run')
  })

  it('survives a failed listing', async () => {
    const runtime = {
      getWorktreePs: async () => {
        throw new Error('graph not ready')
      },
      sleepManagedWorktree: vi.fn(),
      workspaceReopenedAt: new Map<string, number>()
    }
    const logs: string[] = []
    const service = new WorkspaceAutoSleep(runtime, 30 * MIN, () => NOW, (line) => logs.push(line))
    expect(await service.check()).toEqual([])
    expect(logs[0]).toContain('graph not ready')
  })
})
