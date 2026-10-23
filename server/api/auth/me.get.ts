import { AIDI_ORG_SQL } from '~/server/utils/session'
// The signed-in person, their roles in the current workspace, and every workspace they can switch to.
export default defineEventHandler(async (event) => {
  const s = await requireUser(event)
  const orgs = (await asPlatform(() => db().query<{ id: string; name: string; slug: string; kind: string; plan_code: string; status: string }>(
    `SELECT o.id, o.name, o.slug, o.kind, o.plan_code, o.status FROM core.memberships m JOIN core.organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND m.status = 'active' AND o.status = ANY($2::text[]) ${hostBrand(event) === 'finvry' ? 'AND NOT ' + AIDI_ORG_SQL : ''} ORDER BY o.name`, [s.userId, LIVE_ORG_STATUSES]))).rows
  const sup = s.support ? { by: s.support.by, by_name: s.support.byName, can_edit: s.support.canEdit, until: s.support.until } : null
  return { mfa_required: await mfaRequired(event, s), customers_view: s.platform || await customersViewer(s, event), entity_scoped: !!(event.context.entityScope as string | undefined), support_by: sup?.by ?? null, support: sup, email: s.email, roles: s.roles, platform: s.platform, org: orgs.find((o) => o.id === s.orgId) ?? null, orgs }
})
