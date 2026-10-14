// Admins: who sees what on the Overview (sections and analytics tabs, per role).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const cfg = await overviewVisibility()
  return { sections: OVERVIEW_SECTIONS, roles: OVERVIEW_ROLES, visible: Object.fromEntries(OVERVIEW_SECTIONS.map((s) => [s.key, cfg[s.key] ?? [...OVERVIEW_ROLES]])) }
})
