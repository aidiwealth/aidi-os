// The linked sheet for customer revenue, when there is one: when it was last read and what it found.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const l = await customerLink()
  return { url: l.url, name: l.name, auto: l.auto, synced_at: l.synced_at, error: l.error, result: l.result }
})
