// A chart placed in text, as an SVG picture (pages, emails, shared documents). The address is random, like a shared
// document link. Live charts are worked out from the workspace's figures each time; frozen ones show their saved picture.
export default defineEventHandler(async (event) => {
  const m = /^([0-9a-f-]{36})\.svg$/.exec(String(getRouterParam(event, 'file') ?? ''))
  const c = m ? await chartById(m[1]!) : null
  if (!c) throw apiError('not_found', 'Not found', 404)
  setHeader(event, 'content-type', 'image/svg+xml; charset=utf-8')
  setHeader(event, 'cache-control', c.frozen ? 'public, max-age=86400' : 'public, max-age=120')
  setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
  return c.svg
})
