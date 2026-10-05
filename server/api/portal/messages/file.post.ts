// The founder attaches a file in chat.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('portal_file', u.userId ?? 'x', 60, 60 * 60 * 1000)
  return storeChatFile(event, u.orgId, u.client, u.userId ?? null)
})
