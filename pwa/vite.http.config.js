// Plain-HTTP variant of the dev server, used to point a local PWA at the Railway API
// (its CORS allowlist only contains http://localhost origins).
import base from './vite.config.js'

export default {
  ...base,
  plugins: base.plugins.filter(plugin => plugin?.name !== 'vite:basic-ssl'),
  server: { ...base.server, https: false },
}
