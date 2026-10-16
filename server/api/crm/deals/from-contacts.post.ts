// Add contacts to a fundraising pipeline as investors, in its first stage: ticked contacts, a whole list, or everything
// matching a search. Contacts already in the pipeline are skipped. The investor is the contact's firm, or their name.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ pipeline_id: z.string().uuid(), ids: z.array(z.string().uuid()).max(5000).optional(), match: z.object({ q: z.string().max(100).default(''), list: z.string().max(40).default('') }).optional() }).safeParse(await readBody(event))
  if (!b.success || (!b.data.ids?.length && !b.data.match)) throw apiError('invalid', 'Choose the contacts and a pipeline.')
  const stage = (await db().query<{ id: string }>("SELECT id FROM crm.stages WHERE pipeline_id = $1 AND kind = 'open' ORDER BY sort, name LIMIT 1", [b.data.pipeline_id])).rows[0]
  if (!stage) throw apiError('not_found', 'That pipeline has no open stage to add investors to.', 404)
  let rows: { id: string; name: string; firm: string | null }[]
  if (b.data.match) { const f = contactFilter(b.data.match.q, b.data.match.list); rows = (await db().query<{ id: string; name: string; firm: string | null }>(`SELECT c.id, c.name, c.firm FROM crm.contacts c ${f.where}`, f.args)).rows }
  else rows = (await db().query<{ id: string; name: string; firm: string | null }>('SELECT id, name, firm FROM crm.contacts WHERE id = ANY($1::uuid[])', [b.data.ids])).rows
  const have = new Set((await db().query<{ contact_id: string }>('SELECT contact_id FROM crm.deals WHERE pipeline_id = $1 AND contact_id IS NOT NULL', [b.data.pipeline_id])).rows.map((r) => r.contact_id))
  const add = rows.filter((r) => !have.has(r.id))
  if (add.length) await db().query('INSERT INTO crm.deals (pipeline_id, stage_id, investor, contact_id) SELECT $1, $2, x.investor, x.contact_id FROM unnest($3::text[], $4::uuid[]) AS x(investor, contact_id)',
    [b.data.pipeline_id, stage.id, add.map((r) => (r.firm?.trim() || r.name).slice(0, 200)), add.map((r) => r.id)])
  return { ok: true, added: add.length, skipped: rows.length - add.length }
})
