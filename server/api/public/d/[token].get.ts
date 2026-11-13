// A data room link (by token or short address): the files it shares, plus branding, watermark and NDA requirement.
export default defineEventHandler(async (event) => {
  const ref = String(getRouterParam(event, 'token') ?? '')
  const l = await findRoomLink(ref)
  if (!l) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (l.dead) throw apiError('expired', 'This link is no longer active. Ask the company for a new one.', 410)
  setOrgContext(l.organization_id)
  const b = await brandingOf(l.organization_id)
  const company = (await currentOrg())!.name
  // The company logo (set in Settings).
  const logo = logoUrl(await companyLogoId()) ?? b.logo_url
  const base = { company, logo, branding: b, workspace: await publicWorkspace(), require_email: l.require_email, allow_download: l.allow_download, watermark: b.watermark }
  // Invite-only: nothing about the room (not even folder names) until the visitor proves an email on the list.
  const shut = await roomShut(event, ref, l.organization_id)
  if (shut) return { ...base, invite: { page: shut.slug }, nda: { required: false, text: '', key: b.org_key }, files: [], folders: [] }
  const viewer = await invitedViewer(event, l.organization_id)
  if (ndaOn(b, 'room') && !(await ndaSigned(l.organization_id, getQuery(event).nda))) return { ...base, nda: { required: true, text: b.nda_text, key: b.org_key }, files: [] }
  const files = await db().query('SELECT f.id, f.title, f.folder, f.folder_id, f.is_deck, d.mime_type, d.size_bytes FROM fundraise.files f JOIN core.documents d ON d.id = f.document_id WHERE (cardinality($1::uuid[]) = 0 AND ($2::uuid IS NULL OR f.room_id = $2)) OR f.id = ANY($1::uuid[]) ORDER BY f.is_deck DESC, f.folder, f.sort, f.created_at', [l.file_ids, l.room_id])
  // The room's folders, in the company's order (every room's, for the company-wide link). A link to chosen files shows
  // only the folders holding them (and no folder links); a link to a whole room shows them all, empty ones and links too.
  const fo = await db().query<{ id: string; parent_id: string | null; name: string; position: number; link: boolean }>('SELECT id, parent_id, name, position, link_url IS NOT NULL AS link FROM fundraise.folders WHERE CASE WHEN $1::uuid IS NOT NULL THEN room_id = $1 WHEN cardinality($2::uuid[]) > 0 THEN room_id IN (SELECT room_id FROM fundraise.files WHERE id = ANY($2::uuid[])) ELSE true END ORDER BY position, name', [l.room_id, l.file_ids])
  const used = new Set<string>(); const byId = new Map(fo.rows.map((x) => [x.id, x]))
  for (const f of files.rows as { folder_id: string | null }[]) { let id = f.folder_id; while (id && !used.has(id)) { used.add(id); id = byId.get(id)?.parent_id ?? null } }
  if (!l.file_ids.length) for (const x of fo.rows) { let id: string | null = x.id; while (id && !used.has(id)) { used.add(id); id = byId.get(id)?.parent_id ?? null } }
  const folders = fo.rows.filter((x) => used.has(x.id))
  return { ...base, viewer: viewer && viewer !== 'team' ? viewer : null, financials: await investorFinancials().catch(() => null), nda: { required: false, text: '', key: b.org_key }, files: files.rows, folders }
})
