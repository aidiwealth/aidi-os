export default defineEventHandler(async (event) => {
  const s = await readSession(event)
  await endSession(event)
  if (s) await audit({ event, actorUserId: s.userId, action: 'auth.sign_out', objectType: 'user', objectId: s.userId })
  return { ok: true }
})
