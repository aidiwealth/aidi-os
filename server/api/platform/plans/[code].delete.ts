// Delete a plan that no workspace uses (move customers to another plan first).
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const code = String(getRouterParam(event, 'code') ?? '')
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(code) || ['internal', 'company_free'].includes(code)) throw apiError('protected', 'This plan cannot be deleted.', 400)
  const used = (await asPlatform(() => db().query<{ n: number }>('SELECT count(*)::int AS n FROM core.organizations WHERE plan_code = $1', [code]))).rows[0]!.n
  if (used) throw apiError('in_use', used + ' workspace' + (used === 1 ? ' is' : 's are') + ' on this plan. Move them to another plan first, or deactivate it instead.', 409)
  try { await asPlatform(() => db().query('DELETE FROM core.plans WHERE code = $1', [code])) } catch { throw apiError('in_use', 'This plan is still referenced (for example by past subscriptions). Deactivate it instead.', 409) }
  await audit({ event, actorUserId: staff.userId, action: 'platform.plan_delete', objectType: 'plan', detail: { code } })
  return { ok: true }
})
