// Aidi OS — internal back office for The Aidi Group. Never indexed; separate from Aidi Wealth (joinaidi.com).
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  ssr: true,
  experimental: { appManifest: false },
  typescript: { strict: true, typeCheck: false },
  css: [
    '@fontsource/cormorant-garamond/400.css',
    '@fontsource/cormorant-garamond/500.css',
    '@fontsource/instrument-sans/400.css',
    '@fontsource/instrument-sans/500.css',
    '@fontsource/instrument-sans/600.css',
    '~/assets/css/tokens.css',
    '~/assets/css/app.css'
  ],
  runtimeConfig: {
    // Server-only secrets: set in App Platform, never in code
    databaseUrl: '',
    databaseCa: '',
    anthropicApiKey: '',
    public: { appName: 'Aidi OS' }
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Aidi OS',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'theme-color', content: '#0c1a2e' }
      ]
    }
  },
  $production: {
    routeRules: {
      '/**': {
        headers: {
          'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
          'X-Robots-Tag': 'noindex, nofollow'
        }
      }
    }
  }
})
