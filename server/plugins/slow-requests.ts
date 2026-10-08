// Log any request that takes over a second, so slow pages show up in the DigitalOcean logs.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => { event.context.__t0 = Date.now() })
  nitro.hooks.hook('afterResponse', (event) => {
    const t0 = event.context.__t0 as number | undefined; if (!t0) return
    const ms = Date.now() - t0
    if (ms > 1000) console.warn('[slow]', ms + 'ms', event.method, (event.path || '').split('?')[0])
  })
})
