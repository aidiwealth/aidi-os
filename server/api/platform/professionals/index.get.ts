export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const r = await asPlatform(() => db().query(
    `SELECT p.*, (SELECT count(*)::int FROM platform.introductions i WHERE i.professional_id = p.id) AS intros,
            (SELECT count(*)::int FROM platform.introductions i WHERE i.professional_id = p.id AND i.created_at > now() - interval '30 days') AS intros30
       FROM platform.professionals p ORDER BY p.active DESC, p.featured DESC, p.name`))
  return { professionals: r.rows, services: PRO_SERVICES }
})
