// Team page: the features each member can open (what their role allows) and the ones an admin switched off for them.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const org = (await currentOrg())!
  if (org.kind !== 'company') return { features: [], members: {} }
  const on = await enabledModules(), ov = await moduleRoleOverrides(), blocks = await memberBlocks()
  const roles = (await db().query<{ user_id: string; roles: string[] }>('SELECT m.user_id, coalesce(array_agg(DISTINCT ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), \'{}\') AS roles FROM core.memberships m LEFT JOIN core.user_roles ur ON ur.user_id = m.user_id GROUP BY m.user_id')).rows
  // A feature is listed when any of its modules is switched on; a member "has" it when their role may use one of them.
  const features = MEMBER_FEATURES.filter((f) => f.key === 'ai_analyst' || f.codes.some((c) => on.has(c))).map((f) => ({ key: f.key, label: f.label, group: f.group }))
  const members: Record<string, { admin: boolean; allowed: string[]; off: string[] }> = {}
  for (const r of roles) {
    const admin = r.roles.includes('admin')
    const allowed = features.filter((f) => f.key === 'ai_analyst' || MEMBER_FEATURES.find((x) => x.key === f.key)!.codes.some((c) => { const m = MODULES.find((x) => x.code === c); return !!m && on.has(c) && canUse(m, r.roles, ov) })).map((f) => f.key)
    const b = new Set(blocks[r.user_id] ?? [])
    members[r.user_id] = { admin, allowed, off: admin ? [] : allowed.filter((k) => MEMBER_FEATURES.find((x) => x.key === k)!.codes.some((c) => b.has(c))) }
  }
  return { features, members }
})
