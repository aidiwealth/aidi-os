// Give back a download's slot (server/middleware/04.exports.ts) when its response ends, or fails.
export default defineNitroPlugin((nitro) => {
  const give = (event: { context: Record<string, unknown> }) => { if (event.context.__exportSlot) { event.context.__exportSlot = false; exportSlotGive() } }
  nitro.hooks.hook('afterResponse', give)
  nitro.hooks.hook('error', (_e, { event }) => { if (event) give(event) })
})
