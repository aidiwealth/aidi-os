// Log any request that takes over a second, so slow pages show up in the DigitalOcean logs, with how much of it was
// spent waiting on the database (and how many queries). Every response also says so in its Server-Timing header.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => { event.context.__t0 = Date.now() })
  nitro.hooks.hook('beforeResponse', (event) => {
    const t0 = event.context.__t0 as number | undefined; if (!t0) return
    const db = Math.round((event.context.__dbMs as number | undefined) ?? 0), n = (event.context.__dbN as number | undefined) ?? 0
    try { setResponseHeader(event, 'Server-Timing', 'db;dur=' + db + ';desc="' + n + ' queries", app;dur=' + (Date.now() - t0)) } catch { /* headers already sent */ }
  })
  nitro.hooks.hook('afterResponse', (event) => {
    const t0 = event.context.__t0 as number | undefined; if (!t0) return
    const ms = Date.now() - t0
    if (ms > 1000) console.warn('[slow]', ms + 'ms', event.method, (event.path || '').split('?')[0], 'db ' + Math.round((event.context.__dbMs as number | undefined) ?? 0) + 'ms in ' + ((event.context.__dbN as number | undefined) ?? 0) + ' queries')
  })
})
