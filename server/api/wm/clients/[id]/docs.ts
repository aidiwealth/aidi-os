// Staff: client documents. GET lists them; POST drafts from a template, sends (PDF + email; signature if needed), or deletes.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await db().query('SELECT 1 FROM wm.clients WHERE id = $1', [id])).rowCount) throw apiError('not_found', 'Not found', 404)
  if (getMethod(event) === 'GET') return { docs: (await db().query("SELECT id, kind, title, status, requires_signature, doc_id, signed_doc_id, signer_name, signed_at, viewed_at, decline_reason, created_at, holding_id FROM wm.client_docs WHERE client_id = $1 ORDER BY created_at DESC", [id])).rows,
    taxDocs: (await db().query('SELECT id, tax_year, form_type, issuer, created_at, first_viewed_at, downloads FROM core.tax_docs WHERE wm_client_id = $1 ORDER BY tax_year DESC, created_at DESC', [id])).rows,
    holdings: (await db().query("SELECT id, name, category FROM wealth.holdings WHERE wm_client_id = $1 AND status NOT IN ('sold','written_off') ORDER BY created_at DESC", [id])).rows,
    entities: (await db().query("SELECT id, name FROM core.entities WHERE status <> 'dissolved' ORDER BY name")).rows, entity_id: (await db().query<{ entity_id: string | null }>('SELECT entity_id FROM wm.clients WHERE id = $1', [id])).rows[0]?.entity_id ?? null }
  const b = await readBody<Record<string, any>>(event)
  if (b.action === 'draft') return await templateMd(String(b.kind), id, b.holding_id || null, b.entity_id || null)
  if (b.action === 'send') {
    const title = String(b.title ?? '').trim().slice(0, 200), md = String(b.body_md ?? '').slice(0, 200000)
    if (!title || !md.trim()) throw apiError('invalid', 'Add a title and the document text.')
    return { ok: true, id: await issueClientDoc(id, String(b.kind ?? 'other').slice(0, 40), title, md, !!b.requires_signature, user.userId, b.holding_id || null, true, b.entity_id || null) }
  }
  if (b.action === 'delete' && typeof b.doc_id === 'string') { await db().query("DELETE FROM wm.client_docs WHERE id = $1 AND client_id = $2 AND status <> 'signed'", [b.doc_id, id]); return { ok: true } }
  throw apiError('invalid', 'Unknown action.')
})
