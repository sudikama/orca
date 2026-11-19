import { parsePluginImageUrl } from '../../../shared/plugins/images/plugin-image-url'
import type { ValidDiscoveredPlugin } from '../discovery/plugin-discovery'
import { declaredPluginImages } from './plugin-image-artifact-validation'
import type { PluginImageCache } from './plugin-image-cache'
import { readCheckedPluginImage, type CheckedPluginImage } from './plugin-image-read'

// Fork: the phone has no orca-plugin-image:// protocol, so it asks for an image's bytes over RPC.
// Same sources as the desktop protocol handler, minus fonts, theme backgrounds and videos: a
// catalog image by verified hash, or an installed plugin's declared image at its current content.

export type PluginImageRpcDependencies = {
  cache: PluginImageCache | null
  findValidPlugin: (pluginKey: string) => ValidDiscoveredPlugin | null
}

export type PluginImageRpcResult = { mimeType: string; base64: string } | null

export async function readPluginImageForRpc(
  url: string,
  dependencies: PluginImageRpcDependencies
): Promise<PluginImageRpcResult> {
  const reference = parsePluginImageUrl(url)
  let image: CheckedPluginImage | null = null
  try {
    if (reference?.kind === 'sha') {
      image = (await dependencies.cache?.get(reference.sha256)) ?? null
    } else if (reference?.kind === 'installed') {
      const plugin = dependencies.findValidPlugin(reference.pluginKey)
      const current =
        plugin !== null && reference.contentHash === (plugin.isDev ? 'dev' : plugin.contentHash)
      const declared = current
        ? declaredPluginImages(plugin.manifest).find((entry) => entry.slot === reference.slot)
        : undefined
      image =
        plugin && declared
          ? await readCheckedPluginImage(plugin.rootDir, declared.kind, declared.path)
          : null
    }
  } catch {
    image = null
  }
  return image ? { mimeType: image.mimeType, base64: image.bytes.toString('base64') } : null
}
