// A data room link (by token or short address): the files it shares, plus branding, watermark and NDA requirement.
export default defineEventHandler(async (event) => {
  const ref = String(getRouterParam(event, 'token') ?? '')
  const l = await findRoomLink(ref)
  if (!l) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (l.dead) throw apiError('expired', 'This link is no longer active. Ask the company for a new one.', 410)
  setOrgContext(l.organization_id)
  const b = await brandingOf(l.organization_id)
  const company = (await currentOrg())!.name
  const base = { company, branding: b, workspace: await publicWorkspace(), require_email: l.require_email, allow_download: l.allow_download && !b.watermark, watermark: b.watermark }
  if (ndaOn(b, 'room') && !(await ndaSigned(l.organization_id, getQuery(event).nda))) return { ...base, nda: { required: true, text: b.nda_text, key: b.org_key }, files: [] }
  const files = await db().query('SELECT f.id, f.title, f.folder, f.is_deck, d.mime_type, d.size_bytes FROM fundraise.files f JOIN core.documents d ON d.id = f.document_id WHERE cardinality($1::uuid[]) = 0 OR f.id = ANY($1::uuid[]) ORDER BY f.is_deck DESC, f.folder, f.sort, f.created_at', [l.file_ids])
  return { ...base, nda: { required: false, text: '', key: b.org_key }, files: files.rows }
})
