// Admins turn reading receipts with AI on or off (Aidi OS workspaces only).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const org = await currentOrg()
  if (!org || org.kind === 'company') throw apiError('forbidden', 'Not available for this workspace.', 403)
  const on = (await readBody<{ on?: unknown }>(event))?.on === true
  await db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('receipt_ai', $1::boolean) WHERE id = core.current_org()", [on])
  await audit({ event, actorUserId: user.userId, action: 'settings.receipt_ai', objectType: 'organization', objectId: user.orgId ?? undefined, detail: { on } })
  return { ok: true, on }
})
