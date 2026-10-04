// Everything on the fundraising page: data room files, links and recent activity, the round and its investors, memos, SAFEs.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  const files = await db().query('SELECT f.id, f.title, f.folder, f.is_deck, f.created_at, d.size_bytes, d.mime_type FROM fundraise.files f JOIN core.documents d ON d.id = f.document_id ORDER BY f.is_deck DESC, f.folder, f.sort, f.created_at')
  const links = await db().query(`SELECT l.id, l.name, l.file_ids, l.require_email, l.allow_download, to_char(l.expires_at, 'YYYY-MM-DD') AS expires, l.revoked, l.views, l.last_viewed_at, l.created_at,
      (SELECT coalesce(sum(v.seconds), 0)::int FROM fundraise.views v WHERE v.link_id = l.id) AS seconds, (SELECT count(DISTINCT v.viewer_email)::int FROM fundraise.views v WHERE v.link_id = l.id AND v.viewer_email IS NOT NULL) AS viewers
    FROM fundraise.links l ORDER BY l.created_at DESC`)
  const activity = await db().query(`SELECT v.viewer_email, v.seconds, v.started_at, l.name AS link, f.title AS file FROM fundraise.views v JOIN fundraise.links l ON l.id = v.link_id LEFT JOIN fundraise.files f ON f.id = v.file_id ORDER BY v.started_at DESC LIMIT 40`)
  const round = (await db().query("SELECT id, name, instrument, currency, target::float, valuation_cap::float, discount::float, pre_money::float, status, to_char(target_close, 'YYYY-MM-DD') AS target_close FROM fundraise.rounds ORDER BY (status = 'open') DESC, created_at DESC LIMIT 1")).rows[0] ?? null
  const investors = round ? (await db().query('SELECT id, name, firm, email, stage, amount::float, notes, updated_at FROM fundraise.round_investors WHERE round_id = $1 ORDER BY updated_at DESC', [round.id])).rows : []
  const memos = await db().query('SELECT id, title, updated_at FROM fundraise.memos ORDER BY updated_at DESC')
  const safes = await db().query("SELECT id, investor_name, amount::float, currency, valuation_cap::float, discount::float, to_char(safe_date, 'YYYY-MM-DD') AS safe_date FROM fundraise.safes ORDER BY created_at DESC")
  return { company: org.name, currency: (org.settings.currency as string) || 'USD', state: (org.settings.state as string) || '', files: files.rows, links: links.rows, activity: activity.rows, round, investors, memos: memos.rows, safes: safes.rows, base: brands().finvry.url + '/d/' }
})
