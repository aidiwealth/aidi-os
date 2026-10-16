// Content-Security-Policy with a fresh nonce on every page: only scripts the server put in the page (and the scripts
// they load) can run. Injected markup, inline event handlers and javascript: links are blocked even if a bug lets
// them into a page. API responses keep the static policy in nuxt.config (no inline scripts at all).
import { randomBytes } from 'node:crypto'
export const CSP_BASE = "default-src 'self'; frame-src https://challenges.cloudflare.com https://cdn.plaid.com https://*.plaid.com https://www.google.com https://maps.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://pub-f138f42d66b748108ebf7432c7314665.r2.dev https://a0.muscache.com; font-src 'self' data:; connect-src 'self' https://*.plaid.com https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
export default defineNitroPlugin((nitro) => {
  if (import.meta.dev) return
  nitro.hooks.hook('render:html', (html, { event }) => {
    const nonce = randomBytes(18).toString('base64')
    const add = (parts: string[]) => parts.map((p) => p.replace(/<script(?![^>]*\snonce=)/g, '<script nonce="' + nonce + '"'))
    html.head = add(html.head); html.bodyPrepend = add(html.bodyPrepend); html.body = add(html.body); html.bodyAppend = add(html.bodyAppend)
    // 'strict-dynamic' lets the app's own scripts load their chunks and the Plaid / Turnstile scripts they add;
    // the host list is the fallback for older browsers that do not understand nonces.
    setResponseHeader(event, 'Content-Security-Policy', CSP_BASE + "; script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic' https://cdn.plaid.com https://challenges.cloudflare.com")
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
  })
})
