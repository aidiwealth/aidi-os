// Save a previewed import (new rows only; rows already imported are skipped), then match payouts to the bank.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const r = await saveImport(id)
  await audit({ event, actorUserId: user.userId, action: 'rentals.import_saved', objectType: 'rental_import', objectId: id, detail: r })
  return { ok: true, ...r }
})
