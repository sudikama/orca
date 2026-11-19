import { MobilePluginsScreen } from '../../../src/plugins/MobilePluginsScreen'

// Render screen directly: native sibling imports a shell module that throws in browsers, and manifest imports every route.
export default function MobilePluginsRoute() {
  return <MobilePluginsScreen />
}
