// Discard a previewed import.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (/^[0-9a-f-]{36}$/.test(id)) await db().query("UPDATE rentals.imports SET status = 'discarded' WHERE id = $1 AND status = 'preview'", [id])
  return { ok: true }
})
