import { Text, View } from 'react-native'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { openExternalLink } from '../platform/external-links/external-link'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { styles } from './mobile-plugins-styles'
import { pluginKindLabel, pluginKinds } from './plugin-categories'
import type { MarketplaceListing } from './plugin-rpc-schemas'
import { PluginGallery, PluginIcon } from './PluginGallery'
import { PluginSheetButton } from './PluginSheetButton'

function sourceLink(listing: MarketplaceListing): string | null {
  const url = listing.homepage ?? listing.repository
  return url && /^https:\/\//i.test(url) ? url : null
}

/** A marketplace plugin before install: the author's pictures, what it is, and Install. */
export function MarketplaceDetailSheet(props: {
  listing: MarketplaceListing | null
  client: RpcClient | null
  installDisabled: boolean
  busy: boolean
  onInstall: (pluginKey: string) => void
  onClose: () => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { listing } = props
  const link = listing ? sourceLink(listing) : null
  const meta = listing
    ? [
        listing.version,
        listing.license,
        listing.official ? t('plugins.detail.official', 'Official') : undefined,
        ...pluginKinds(listing.categories).map((kind) => pluginKindLabel(kind, t))
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  return (
    <BottomDrawer visible={listing !== null} onClose={props.onClose} contentScrollable>
      {listing ? (
        <View>
          <View style={styles.sheetHeader}>
            <PluginIcon client={props.client} images={listing.images} size={40} />
            <Text style={[styles.sheetTitle, styles.sheetHeaderTitle]}>
              {listing.name ?? listing.pluginKey}
            </Text>
          </View>
          {meta ? <Text style={styles.sheetMeta}>{meta}</Text> : null}
          <PluginGallery client={props.client} images={listing.images} />
          {listing.description ? <Text style={styles.sheetText}>{listing.description}</Text> : null}
          <View style={styles.actions}>
            {link ? (
              <PluginSheetButton
                label={t('plugins.detail.source', 'Source')}
                onPress={() => openExternalLink(link)}
              />
            ) : null}
            <PluginSheetButton
              primary
              label={
                listing.blocked
                  ? t('plugins.screen.blocked', 'Blocked')
                  : props.busy
                    ? t('plugins.detail.installing', 'Installing…')
                    : t('plugins.screen.install', 'Install')
              }
              disabled={props.installDisabled || listing.blocked}
              onPress={() => props.onInstall(listing.pluginKey)}
            />
          </View>
        </View>
      ) : null}
    </BottomDrawer>
  )
}
