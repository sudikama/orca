import { useEffect, useState } from 'react'
import { Image, ScrollView, Text, View } from 'react-native'
import { Puzzle } from 'lucide-react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { PluginImage, PluginImages } from './plugin-rpc-schemas'

// Fork: plugin images arrive as bytes over RPC (the phone has no orca-plugin-image:// scheme).
// URLs name verified bytes by hash, so a short in-memory cache is always correct.
const CACHE_LIMIT = 64
const cache = new Map<string, string>()

async function readImageUri(client: RpcClient, url: string): Promise<string | null> {
  const hit = cache.get(url)
  if (hit) {
    return hit
  }
  const res = await client.sendRequest('plugins.readImage', { url })
  const value = res.ok ? (res.result as { mimeType?: unknown; base64?: unknown } | null) : null
  if (!value || typeof value.mimeType !== 'string' || typeof value.base64 !== 'string') {
    return null
  }
  const uri = `data:${value.mimeType};base64,${value.base64}`
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  cache.set(url, uri)
  return uri
}

function PluginImageView(props: { client: RpcClient | null; image: PluginImage; width?: number }) {
  useMobileColorScheme()
  const { client, image } = props
  const [uri, setUri] = useState<string | null>(() => cache.get(image.url) ?? null)
  useEffect(() => {
    if (!client || cache.has(image.url)) {
      return
    }
    let cancelled = false
    readImageUri(client, image.url).then(
      (next) => !cancelled && setUri(next),
      () => {}
    )
    return () => {
      cancelled = true
    }
  }, [client, image.url])
  const aspectRatio = image.width && image.height ? image.width / image.height : 16 / 10
  return (
    <View style={[styles.frame, { aspectRatio }, props.width ? { width: props.width } : null]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={image.alt}
        />
      ) : null}
    </View>
  )
}

/** The plugin's own icon (else its cover, cropped square); the generic glyph only without either. */
export function PluginIcon(props: {
  client: RpcClient | null
  images: PluginImages
  size?: number
  // Long lists pass false: a cover can be a megabyte, too much to fetch per row.
  coverFallback?: boolean
}) {
  useMobileColorScheme()
  const { client } = props
  const size = props.size ?? 28
  const image =
    props.images?.icon ?? (props.coverFallback === false ? undefined : props.images?.cover)
  const url = image?.url ?? null
  const [uri, setUri] = useState<string | null>(() => (url ? (cache.get(url) ?? null) : null))
  useEffect(() => {
    setUri(url ? (cache.get(url) ?? null) : null)
    if (!client || !url || cache.has(url)) {
      return
    }
    let cancelled = false
    readImageUri(client, url).then(
      (next) => !cancelled && setUri(next),
      () => {}
    )
    return () => {
      cancelled = true
    }
  }, [client, url])
  const box = { width: size, height: size, borderRadius: Math.round(size / 4.5) }
  return uri ? (
    <Image
      source={{ uri }}
      style={[styles.icon, box]}
      resizeMode="cover"
      accessibilityLabel={image?.alt}
    />
  ) : (
    <View style={[styles.icon, styles.iconFallback, box]}>
      <Puzzle size={Math.round(size * 0.6)} color={colors.textSecondary} />
    </View>
  )
}

/** The author's cover, then the screenshots as a swipeable strip; nothing when there are none. */
export function PluginGallery(props: { client: RpcClient | null; images: PluginImages }) {
  useMobileColorScheme()
  const { client, images } = props
  const cover = images?.cover
  const shots = (images?.screenshots ?? []).filter((shot) => shot.url !== cover?.url)
  if (!cover && shots.length === 0) {
    return null
  }
  return (
    <View style={styles.gallery}>
      {cover ? <PluginImageView client={client} image={cover} /> : null}
      {shots.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {shots.map((shot) => (
            <View key={shot.url} style={styles.shot}>
              <PluginImageView client={client} image={shot} width={260} />
              {shot.caption || shot.alt ? (
                <Text style={styles.caption} numberOfLines={2}>
                  {shot.caption ?? shot.alt}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  gallery: { gap: spacing.sm, marginVertical: spacing.sm },
  frame: {
    width: '100%',
    borderRadius: radii.surface,
    overflow: 'hidden',
    backgroundColor: colors.bgRaised
  },
  image: { width: '100%', height: '100%' },
  strip: { gap: spacing.sm },
  shot: { width: 260, gap: spacing.xs },
  caption: { fontSize: typography.metaSize, color: colors.textMuted },
  icon: { overflow: 'hidden', backgroundColor: colors.bgRaised },
  iconFallback: { alignItems: 'center', justifyContent: 'center' }
}))
