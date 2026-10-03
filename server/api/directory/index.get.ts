// Fund services directory for workspace users: active profiles only.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const r = await asPlatform(() => db().query(
    `SELECT id, name, firm, title, services, jurisdictions, bio, website, photo_url, featured FROM platform.professionals WHERE active ORDER BY featured DESC, name`))
  return { professionals: r.rows, services: PRO_SERVICES }
})
