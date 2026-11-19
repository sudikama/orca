import * as z from 'zod'

// Only the fields the phone reads; hosts may add more, and older hosts may omit optional ones.
const PluginCommandSchema = z.object({
  id: z.string(),
  title: z.string(),
  context: z.string().catch('global')
})

const PluginImageSchema = z.object({
  url: z.string(),
  alt: z.string().catch(''),
  width: z.number().optional().catch(undefined),
  height: z.number().optional().catch(undefined)
})

export type PluginImage = z.infer<typeof PluginImageSchema>

// Fork: icon, cover and screenshots as orca-plugin-image:// URLs; the phone reads their bytes over RPC.
const PluginImagesSchema = z
  .object({
    icon: PluginImageSchema.optional().catch(undefined),
    cover: PluginImageSchema.optional().catch(undefined),
    screenshots: z
      .array(PluginImageSchema.extend({ caption: z.string().optional().catch(undefined) }))
      .catch([])
  })
  .optional()
  .catch(undefined)

export type PluginImages = z.infer<typeof PluginImagesSchema>

export const PluginListEntrySchema = z.object({
  pluginKey: z.string(),
  name: z.string(),
  version: z.string(),
  publisher: z.string().catch(''),
  description: z.string().optional().catch(undefined),
  status: z.string(),
  needsReconsent: z.boolean().catch(false),
  error: z.string().optional().catch(undefined),
  official: z.boolean().catch(false),
  hasWorker: z.boolean().catch(false),
  blockedByKillList: z.object({ reason: z.string() }).optional().catch(undefined),
  commands: z.array(PluginCommandSchema).catch([]),
  panels: z.array(z.object({ id: z.string(), title: z.string() })).catch([]),
  source: z.object({ kind: z.string() }).optional().catch(undefined),
  types: z.array(z.string()).catch([]),
  images: PluginImagesSchema,
  license: z.string().optional().catch(undefined),
  repository: z.string().optional().catch(undefined)
})

export type PluginListEntry = z.infer<typeof PluginListEntrySchema>

export const PluginListSchema = z.array(PluginListEntrySchema)

const MarketplaceListingSchema = z.object({
  pluginKey: z.string(),
  name: z.string().optional().catch(undefined),
  version: z.string().optional().catch(undefined),
  description: z.string().optional().catch(undefined),
  official: z.boolean().catch(false),
  blocked: z.boolean().catch(false),
  categories: z.array(z.string()).catch([]),
  images: PluginImagesSchema,
  license: z.string().optional().catch(undefined),
  repository: z.string().optional().catch(undefined),
  homepage: z.string().optional().catch(undefined)
})

export type MarketplaceListing = z.infer<typeof MarketplaceListingSchema>

export const MarketplaceListSchema = z.object({
  systemEnabled: z.boolean(),
  listings: z.array(MarketplaceListingSchema).catch([])
})

export const PluginApprovalRequestSchema = z.object({
  pluginKey: z.string(),
  name: z.string(),
  version: z.string(),
  action: z.string(),
  approvalFingerprint: z.string(),
  why: z.string().catch(''),
  grants: z
    .object({
      executionDescription: z.string().catch(''),
      capabilities: z.array(z.object({ description: z.string() })).catch([])
    })
    .catch({ executionDescription: '', capabilities: [] })
})

export type PluginApprovalRequest = z.infer<typeof PluginApprovalRequestSchema>

export const PluginLogsSchema = z.object({
  lines: z.array(z.object({ ts: z.number(), level: z.string(), line: z.string() })).catch([])
})

export type PluginLogLine = z.infer<typeof PluginLogsSchema>['lines'][number]

/** The host refuses a change that needs the user's approval with one of these codes. */
export const PLUGIN_APPROVAL_CODES: ReadonlySet<string> = new Set([
  'approval_required',
  'approval_stale'
])

/** pending waits for approval; disabled is off. Every other status means the plugin is on. */
export function isPluginEnabled(plugin: PluginListEntry): boolean {
  return plugin.status !== 'disabled' && plugin.status !== 'pending'
}
