// Put a generated document into the data room as a PDF: { kind: 'safe' | 'memo' | 'nda' | 'update', id?, folder? }
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const b = z.object({ kind: z.enum(['safe', 'memo', 'nda', 'update']), id: z.string().uuid().optional(), folder: z.string().trim().max(60).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a document.')
  const d = b.data, org = (await currentOrg())!
  let title = '', docs: { title: string; md: string }[] = [], folder = d.folder || ''
  if (d.kind === 'safe') {
    const s = d.id ? (await db().query("SELECT *, amount::float AS amount, valuation_cap::float AS valuation_cap, discount::float AS discount, to_char(safe_date, 'YYYY-MM-DD') AS safe_date FROM fundraise.safes WHERE id = $1", [d.id])).rows[0] as SafeRow | undefined : undefined
    if (!s) throw apiError('not_found', 'SAFE not found.', 404)
    docs = safeDocs(s); title = 'SAFE - ' + s.investor_name; folder ||= 'Legal'
  } else if (d.kind === 'memo') {
    const m = d.id ? (await db().query<{ title: string; body: string }>('SELECT title, body FROM fundraise.memos WHERE id = $1', [d.id])).rows[0] : undefined
    if (!m) throw apiError('not_found', 'Memo not found.', 404)
    title = m.title || 'Deal memo'; docs = [{ title, md: m.body || '' }]; folder ||= 'Company'
  } else if (d.kind === 'nda') {
    const br = await brandingOf(org.id)
    if (!br.nda_text) throw apiError('not_found', 'Set up your NDA first (Fundraising → NDAs).', 404)
    title = 'Mutual NDA - ' + org.name; docs = [{ title, md: '# Mutual Non-Disclosure Agreement\n\n' + br.nda_text + '\n\n## Signatures\n\n**Company**\n\n' + org.name + '\n\nBy: ______________________________\n\nName: ______________________________\n\nDate: ______________________________\n\n**Recipient**\n\nBy: ______________________________\n\nName: ______________________________\n\nDate: ______________________________' }]; folder ||= 'Legal'
  } else {
    const u = d.id ? (await db().query<{ title: string; blocks: { type: string; md?: string; title?: string; url?: string; caption?: string }[] }>('SELECT title, blocks FROM financials.updates WHERE id = $1', [d.id])).rows[0] : undefined
    if (!u) throw apiError('not_found', 'Update not found.', 404)
    const md = ['# ' + (u.title || 'Investor update'), '']
    for (const bl of u.blocks ?? []) { if (bl.type === 'text' && bl.md) md.push(bl.md, ''); else if ((bl.type === 'chart' || bl.type === 'metrics_table') && bl.title) md.push('**' + bl.title + '** (see the online version for the chart)', ''); else if (['video', 'deck', 'file'].includes(bl.type) && bl.url) md.push((bl.caption || bl.type) + ': ' + bl.url, '') }
    title = u.title || 'Investor update'; docs = [{ title, md: md.join('\n') }]; folder ||= 'Investor updates'
  }
  const bytes = await legalPdf(org.name, docs)
  const docId = randomUUID(), key = 'documents/' + docId + '.pdf', name = (title.replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 180) || 'document') + '.pdf'
  await putObject({ key, body: bytes, contentType: 'application/pdf' })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,'application/pdf',$4,$5)", [docId, 'Data room — ' + name, key, bytes.length, createHash('sha256').update(bytes).digest('hex')])
  await db().query('INSERT INTO fundraise.files (document_id, title, folder) VALUES ($1,$2,$3)', [docId, name, folder])
  await audit({ event, actorUserId: user.userId, action: 'fundraising.room_add_generated', objectType: d.kind, objectId: d.id ?? undefined })
  return { ok: true, title: name, folder }
})
