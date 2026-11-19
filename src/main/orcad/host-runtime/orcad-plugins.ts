import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Store } from '../../persistence/loading-store/store'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { PluginService } from '../../plugins/plugin-service'
import { PluginKillListService } from '../../plugins/catalog/plugin-kill-list-service'
import { PluginMarketplaceService } from '../../plugins/catalog/plugin-marketplace-service'
import { PluginMarketplaceInstaller } from '../../plugins/catalog/plugin-marketplace-installer'
import { PluginImageCache } from '../../plugins/media/plugin-image-cache'
import { getPluginsDataDir } from '../../plugins/discovery/plugin-discovery'
import {
  applyPluginConsent,
  applyPluginEnablement,
  revokePluginConsent
} from '../../plugins/activation/plugin-enablement'
import {
  bindPluginRuntime,
  createPluginAgentStatusForwarder,
  watchPluginWorkspaceContext
} from '../../plugins/runtime/plugin-runtime-binding'
import { projectPluginAgentStatusChangedPayload } from '../../plugins/events/plugin-agent-status-event'
import { emitPluginWorktreeLifecycleTo } from '../../plugins/events/plugin-worktree-lifecycle-event'
import { setPluginServiceForRpc } from '../../runtime/rpc/methods/plugins/plugins'
import { setPluginInstallServicesForRpc } from '../../runtime/rpc/methods/plugins/plugin-install-methods'
import { ALL_RPC_METHODS } from '../../runtime/rpc/methods/rpc-method-registry'
import {
  currentWorkerEntryLayout,
  resolveWorkerThreadEntryPath
} from '../../worker-threads/worker-thread-entry-path'
import { pluginHostVersion } from '../../../shared/plugins/installation/plugin-host-version'
import type { PluginConsentRequest } from '../../../shared/plugins/approval/plugin-consent-request'
import {
  normalizePluginConsents,
  normalizePluginIdList
} from '../../../shared/plugins/approval/plugin-consent-state'
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import type { agentHookServer as AgentHookServerInstance } from '../../agent-hooks/server/agent-hook-server'

const PLUGIN_HOST_ENTRY = 'plugin-host-entry.js'
// Why delayed: the official catalog fetch must not compete with orcad startup.
const MARKETPLACE_SEED_DELAY_MS = 15_000

/** orcad ships each child flat beside its bundle; mirror the other worker resolvers. */
function resolveOrcadPluginHostEntryPath(): string {
  const entry = resolveWorkerThreadEntryPath(currentWorkerEntryLayout(__dirname), PLUGIN_HOST_ENTRY)
  return [entry, join(dirname(entry), '..', PLUGIN_HOST_ENTRY)].find(existsSync) ?? entry
}

/**
 * The desktop's plugin wiring (main-process-plugins.ts) for headless orcad, without Electron:
 * no windows, image protocol, frame guests, status bar, appearance, bundled plugins, install
 * stats or auto-update. The plugin system follows the `pluginSystemEnabled` setting.
 */
export async function startOrcadPlugins(input: {
  runtime: OrcaRuntimeService
  store: Store
  userDataPath: string
  agentHookServer: typeof AgentHookServerInstance
  registerCleanup: (cleanup: () => void) => void
}): Promise<void> {
  const { runtime, store, userDataPath, agentHookServer, registerCleanup } = input
  const pluginsDataDir = getPluginsDataDir(userDataPath)
  const hostVersion = pluginHostVersion(getAppEnvironment().getVersion())
  const systemEnabled = (): boolean => store.getSettings().pluginSystemEnabled === true

  const killList = new PluginKillListService({ pluginsDataDir })
  await killList.initialize()
  const imageCache = new PluginImageCache(join(pluginsDataDir, 'image-cache'))
  const marketplace = new PluginMarketplaceService({
    imageCache,
    pluginsDataDir,
    getKillListEntry: (pluginKey) => killList.find(pluginKey),
    hostVersion
  })
  let service: PluginService | null = null
  const installer = new PluginMarketplaceInstaller({
    marketplace,
    userDataPath,
    hostVersion,
    blockedPluginReason: (pluginKey) => killList.reason(pluginKey),
    imageCache,
    revokeConsent: (pluginKey) => revokePluginConsent({ store, pluginService: service, pluginKey })
  })
  const pluginService = new PluginService({
    userDataPath,
    hostVersion,
    // With the setting off, discovery returns nothing and no plugin code runs.
    isPluginSystemEnabled: systemEnabled,
    getDisabledPlugins: () => normalizePluginIdList(store.getSettings().disabledPlugins),
    getPluginConsents: () => normalizePluginConsents(store.getSettings().pluginConsents),
    getDevPluginPaths: () => normalizePluginIdList(store.getSettings().devPluginPaths),
    getPluginKillListEntry: (pluginKey) => killList.find(pluginKey),
    hostEntryPath: resolveOrcadPluginHostEntryPath()
  })
  service = pluginService

  const seedMarketplace = (): void => {
    if (!systemEnabled()) {
      return
    }
    void marketplace
      .seedOfficialSource()
      .catch((error) => console.warn('[orcad-plugins] official marketplace seed failed:', error))
    void marketplace
      .seedCommunitySource()
      .catch((error) => console.warn('[orcad-plugins] community marketplace seed failed:', error))
  }
  const refreshKillList = (): void => {
    void killList
      .refresh()
      .catch((error) => console.warn('[orcad-plugins] safety list refresh failed:', error))
  }

  const unsubscribeKillList = killList.onChanged(() => {
    void pluginService
      .reconcileActivationState()
      .catch((error) => console.warn('[orcad-plugins] safety list apply failed:', error))
  })
  const unsubscribeSettings = store.onSettingsChanged((updates) => {
    if (updates.pluginSystemEnabled === true) {
      seedMarketplace()
      refreshKillList()
    }
    if (updates.pluginSystemEnabled !== undefined) {
      killList.syncPeriodicRefresh(updates.pluginSystemEnabled === true)
    }
    if ('pluginSystemEnabled' in updates || 'devPluginPaths' in updates) {
      void pluginService
        .refresh()
        .catch((error) => console.warn('[orcad-plugins] settings apply failed:', error))
    }
  })

  const delegate = bindPluginRuntime(pluginService, runtime, agentHookServer, ALL_RPC_METHODS)
  const applyConsent = (request: PluginConsentRequest) =>
    applyPluginConsent({ store, pluginService, ...request })
  setPluginServiceForRpc(pluginService, {
    applyConsent,
    applyEnablement: (pluginKey, enabled) =>
      applyPluginEnablement({ store, pluginService, pluginKey, enabled }),
    setPluginSystemEnabled: (pluginSystemEnabled) =>
      store.updateSettings({ pluginSystemEnabled }, { notifyListeners: true }),
    setDevPluginPaths: (devPluginPaths) =>
      store.updateSettings({ devPluginPaths }, { notifyListeners: true })
  })
  setPluginInstallServicesForRpc({
    pluginService,
    catalogs: { marketplace, installer },
    applyConsent,
    store,
    imageCache
  })

  const forwardAgentStatus = createPluginAgentStatusForwarder(delegate, pluginService)
  const unsubscribeStatus = agentHookServer.subscribeEnrichedStatus((enriched) => {
    const payload = projectPluginAgentStatusChangedPayload(enriched, store)
    if (payload) {
      forwardAgentStatus(payload, enriched.terminalHandle)
    }
  })
  const stopWorkspaceWatch = watchPluginWorkspaceContext({
    delegate,
    events: pluginService,
    onSessionWritten: (listener) => store.onWorkspaceSessionWritten(listener),
    onStateWritten: (listener) => store.onStateWritten(listener)
  })
  const unsubscribeLifecycle = runtime.onWorktreeLifecycle((event) =>
    emitPluginWorktreeLifecycleTo(pluginService, event)
  )

  // Initialization discovers manifests only; workers start on explicit triggers.
  void pluginService
    .initialize()
    .then(() => console.info('[orcad-plugins] plugin system ready'))
    .catch((error) => console.warn('[orcad-plugins] plugin service init failed:', error))
  if (systemEnabled()) {
    refreshKillList()
    killList.syncPeriodicRefresh(true)
  }
  setTimeout(seedMarketplace, MARKETPLACE_SEED_DELAY_MS).unref?.()

  registerCleanup(() => {
    unsubscribeSettings?.()
    unsubscribeKillList()
    unsubscribeStatus()
    stopWorkspaceWatch()
    unsubscribeLifecycle()
    killList.syncPeriodicRefresh(false)
    setPluginServiceForRpc(null)
    setPluginInstallServicesForRpc(null)
    void pluginService.dispose().catch(() => {})
  })
}
