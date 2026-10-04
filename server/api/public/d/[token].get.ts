// A tracked data room link: the files it shares (no file content until the visitor opens one).
async function link(token: string) {
  if (token.length < 30) throw apiError('invalid_link', 'This link is not valid.', 404)
  const l = (await asPlatform(() => db().query<{ id: string; organization_id: string; name: string; file_ids: string[]; require_email: boolean; allow_download: boolean; dead: boolean }>(
    'SELECT id, organization_id, name, file_ids, require_email, allow_download, (revoked OR (expires_at IS NOT NULL AND expires_at < now())) AS dead FROM fundraise.links WHERE token_hash = $1', [sha256(token)]))).rows[0]
  if (!l) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (l.dead) throw apiError('expired', 'This link is no longer active. Ask the company for a new one.', 410)
  setOrgContext(l.organization_id)
  return l
}
export default defineEventHandler(async (event) => {
  const l = await link(String(getRouterParam(event, 'token') ?? ''))
  const files = await db().query('SELECT f.id, f.title, f.folder, f.is_deck, d.mime_type, d.size_bytes FROM fundraise.files f JOIN core.documents d ON d.id = f.document_id WHERE cardinality($1::uuid[]) = 0 OR f.id = ANY($1::uuid[]) ORDER BY f.is_deck DESC, f.folder, f.sort, f.created_at', [l.file_ids])
  return { company: (await currentOrg())!.name, require_email: l.require_email, allow_download: l.allow_download, files: files.rows, workspace: await publicWorkspace() }
})
