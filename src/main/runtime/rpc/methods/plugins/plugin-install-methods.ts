import { hostname } from 'node:os'
import { defineMethod, type RpcContext } from '../../core'
import {
  PluginCatalogAddParams,
  PluginCatalogRemoveParams,
  PluginInstallParams,
  PluginReadImageParams,
  PluginUninstallParams,
  PluginUpdateParams
} from '../../../../../shared/rpc-contract/plugins/plugins-params'
import {
  PLUGIN_NOT_FOUND_CODE,
  PluginCliError
} from '../../../../../shared/plugins/approval/plugin-cli-approval'
import { PLUGIN_PROTOCOL_VERSION } from '../../../../../shared/plugins/frames/plugin-protocol'
import {
  pluginFrameMethodsFor,
  pluginHostApiMinorFor
} from '../../../../../shared/plugins/workers/plugin-host-api'
import { PLUGIN_HOST_API_MAJOR } from '../../../../../shared/plugins/workers/plugin-host-api-major'
import type { Store } from '../../../../persistence/loading-store/store'
import type { PluginConsentRequest } from '../../../../../shared/plugins/approval/plugin-consent-request'
import type { PluginHostListEntry } from '../../../../../shared/plugins/plugin-list-entry'
import { listPluginsForClients } from '../../../../plugins/discovery/plugin-client-list'
import type { PluginService } from '../../../../plugins/plugin-service'
import type { PluginImageCache } from '../../../../plugins/media/plugin-image-cache'
import { readPluginImageForRpc } from '../../../../plugins/media/plugin-image-rpc-read'
import type { PluginCliCatalogs } from '../../../../plugins/cli/plugin-cli-catalog-candidates'
import {
  installPluginFromCli,
  type PluginCliInstallDeps
} from '../../../../plugins/cli/plugin-cli-install'
import {
  updateAllApprovalError,
  updateAllPluginsFromCli,
  updatePluginFromCli
} from '../../../../plugins/cli/plugin-cli-update'
import {
  addPluginCatalogFromCli,
  listPluginCatalogsFromCli,
  removePluginCatalogFromCli
} from '../../../../plugins/cli/plugin-cli-catalogs'
import { uninstallInstalledPlugin } from '../../../../plugins/installation/plugin-uninstall'
import { assertPluginSystemEnabled } from '../../../../plugins/development/plugin-dev-folders'

/** What install, update, uninstall and catalog RPCs need beyond the plugin service. */
export type PluginInstallRpcServices = {
  pluginService: PluginService
  catalogs: PluginCliCatalogs
  applyConsent: (request: PluginConsentRequest) => Promise<void>
  store: Pick<Store, 'getSettings' | 'updateSettings'>
  afterUninstall?: (pluginKey: string) => Promise<void>
  /** Fork: verified catalog images, for phones that read them over RPC. */
  imageCache?: PluginImageCache
}

let installServicesForRpc: PluginInstallRpcServices | null = null

export function setPluginInstallServicesForRpc(services: PluginInstallRpcServices | null): void {
  installServicesForRpc = services
}

async function requireInstallServices(): Promise<PluginInstallRpcServices> {
  if (!installServicesForRpc) {
    throw new Error('Plugin installs are not available on this runtime')
  }
  await installServicesForRpc.pluginService.whenReady()
  return installServicesForRpc
}

function installDeps(
  services: PluginInstallRpcServices,
  context: RpcContext
): PluginCliInstallDeps {
  return {
    service: services.pluginService,
    catalogs: services.catalogs,
    applyConsent: services.applyConsent,
    // Why the hostname: a credential fix must happen on the machine whose Git ran.
    executionHost: `the Orca host (${hostname()})`,
    caller: context.caller
  }
}

async function listEntry(
  service: PluginService,
  pluginKey: string
): Promise<PluginHostListEntry | null> {
  return (
    (await listPluginsForClients(service)).find((entry) => entry.pluginKey === pluginKey) ?? null
  )
}

export const PLUGIN_INSTALL_METHODS = [
  defineMethod({
    // Git runs on this host with its own credentials and no prompts; code needs the approve flag.
    name: 'plugins.install',
    permission: 'host-admin',
    params: PluginInstallParams,
    handler: async (params, context) => {
      const services = await requireInstallServices()
      const outcome = await installPluginFromCli(
        installDeps(services, context),
        params.source,
        params.approvalFingerprint
      )
      return { ...outcome, plugin: await listEntry(services.pluginService, outcome.pluginKey) }
    }
  }),
  defineMethod({
    name: 'plugins.update',
    permission: 'host-admin',
    params: PluginUpdateParams,
    handler: async (params, context) => {
      const services = await requireInstallServices()
      const deps = installDeps(services, context)
      if (params.pluginKey === undefined) {
        const result = await updateAllPluginsFromCli(deps)
        const approval = updateAllApprovalError(result)
        if (approval) {
          throw approval
        }
        return result
      }
      return updatePluginFromCli(deps, params.pluginKey, params.approvalFingerprint)
    }
  }),
  defineMethod({
    name: 'plugins.uninstall',
    permission: 'host-admin',
    params: PluginUninstallParams,
    handler: async (params) => {
      const services = await requireInstallServices()
      assertPluginSystemEnabled(services.pluginService)
      const removed = await uninstallInstalledPlugin({
        pluginService: services.pluginService,
        store: services.store,
        afterRemove: services.afterUninstall,
        pluginKey: params.pluginKey
      })
      if (!removed) {
        throw new PluginCliError(
          PLUGIN_NOT_FOUND_CODE,
          `${params.pluginKey} is not an installed plugin that can be removed.`,
          {
            pluginKey: params.pluginKey,
            nextSteps: [
              'Plugins bundled with Orca cannot be removed; disable them with `orca plugin disable`.',
              'Remove a development folder with `orca plugin dev unload`.'
            ]
          }
        )
      }
      return { pluginKey: params.pluginKey, removed: true }
    }
  }),
  defineMethod({
    name: 'plugins.catalogList',
    permission: 'host-admin',
    params: null,
    handler: async () => {
      const services = await requireInstallServices()
      return listPluginCatalogsFromCli(catalogDeps(services))
    }
  }),
  defineMethod({
    // Fork: phones browse the marketplace; the desktop reads it over IPC instead.
    name: 'plugins.marketplaceList',
    permission: 'host-admin',
    params: null,
    handler: async () => {
      const services = await requireInstallServices()
      const systemEnabled = services.store.getSettings().pluginSystemEnabled === true
      if (!systemEnabled) {
        return { systemEnabled, listings: [] }
      }
      const listings = await services.catalogs.marketplace.listPlugins()
      return {
        systemEnabled,
        listings: listings.map((listing) => ({
          pluginKey: listing.pluginKey,
          name: listing.name,
          version: listing.version,
          description: listing.description,
          official: listing.official,
          blocked: listing.blockedByKillList !== undefined,
          categories: listing.categories,
          images: listing.images,
          license: listing.license,
          repository: listing.repository,
          homepage: listing.homepage,
          updatedAt: listing.updatedAt
        }))
      }
    }
  }),
  defineMethod({
    // Fork: image bytes for a phone, which cannot load the orca-plugin-image:// scheme.
    name: 'plugins.readImage',
    permission: 'workspace',
    params: PluginReadImageParams,
    handler: async (params) => {
      const services = await requireInstallServices()
      return readPluginImageForRpc(params.url, {
        cache: services.imageCache ?? null,
        findValidPlugin: (pluginKey) => services.pluginService.findValidPlugin(pluginKey)
      })
    }
  }),
  defineMethod({
    // Fork: what a phone's panel frame is offered, computed here so the phone carries no API tables.
    name: 'plugins.panelHello',
    permission: 'workspace',
    params: null,
    handler: async () => {
      const methods = pluginFrameMethodsFor('panel', false)
      return {
        protocol: PLUGIN_PROTOCOL_VERSION,
        surface: 'panel' as const,
        api: { major: PLUGIN_HOST_API_MAJOR, minor: pluginHostApiMinorFor(methods) },
        methods
      }
    }
  }),
  defineMethod({
    name: 'plugins.catalogAdd',
    permission: 'host-admin',
    params: PluginCatalogAddParams,
    handler: async (params) => {
      const services = await requireInstallServices()
      return addPluginCatalogFromCli(catalogDeps(services), params)
    }
  }),
  defineMethod({
    name: 'plugins.catalogRemove',
    permission: 'host-admin',
    params: PluginCatalogRemoveParams,
    handler: async (params) => {
      const services = await requireInstallServices()
      return removePluginCatalogFromCli(catalogDeps(services), params.catalog)
    }
  })
]

function catalogDeps(services: PluginInstallRpcServices) {
  return {
    catalogs: services.catalogs,
    host: { executionHost: `the Orca host (${hostname()})` },
    service: services.pluginService
  }
}
