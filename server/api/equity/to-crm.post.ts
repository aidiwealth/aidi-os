// Brings cap table holders (e.g. from an uploaded cap table) into Fundraising: into a pipeline, closed when they have
// invested (with the amount and any SAFE / note cap and discount, and already linked to their cap table record so
// they are not added twice), and into Contacts (new contacts subscribed; anyone who unsubscribed stays unsubscribed) and onto a list so they
// receive investor updates.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = z.object({ ct: z.string().uuid().optional(),
    holders: z.array(z.object({ id: z.string().uuid(), email: z.string().trim().max(254).optional() })).min(1).max(500),
    pipeline: z.object({ id: z.string().uuid().or(z.literal('new')), new_name: z.string().trim().max(120).optional(), closed: z.boolean().default(true) }).optional(),
    contacts: z.object({ list_id: z.string().uuid().or(z.literal('new')).or(z.literal('')).optional(), new_list: z.string().trim().max(80).optional() }).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the holders and where they go.')
  const d = b.data
  if (!d.pipeline && !d.contacts) throw apiError('invalid', 'Choose a pipeline, Contacts, or both.')
  const ct = await capTableId(d.ct)
  const emailOk = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  const rows = (await db().query<{ id: string; name: string; email: string | null; invested: number; conv_id: string | null; iss_id: string | null; cap: number | null; disc: number | null; post: boolean | null }>(`SELECT h.id, h.name, h.email,
      (coalesce((SELECT sum(i.shares * coalesce(i.price, 0)) FROM equity.issuances i WHERE i.holder_id = h.id), 0) + coalesce((SELECT sum(c.amount) FROM equity.convertibles c WHERE c.holder_id = h.id), 0))::float AS invested,
      (SELECT c.id FROM equity.convertibles c WHERE c.holder_id = h.id ORDER BY c.issued_on LIMIT 1) AS conv_id, (SELECT i.id FROM equity.issuances i WHERE i.holder_id = h.id ORDER BY i.issued_on LIMIT 1) AS iss_id,
      (SELECT c.valuation_cap::float FROM equity.convertibles c WHERE c.holder_id = h.id ORDER BY c.issued_on LIMIT 1) AS cap, (SELECT c.discount_pct::float FROM equity.convertibles c WHERE c.holder_id = h.id ORDER BY c.issued_on LIMIT 1) AS disc,
      (SELECT c.post_money FROM equity.convertibles c WHERE c.holder_id = h.id ORDER BY c.issued_on LIMIT 1) AS post
    FROM equity.holders h WHERE h.captable_id = $1 AND h.id = ANY($2::uuid[])`, [ct, d.holders.map((h) => h.id)])).rows
  if (!rows.length) throw apiError('invalid', 'Those holders are not on this cap table.')
  // A missing email typed in the form is saved on the holder too.
  for (const r of rows) { const e = d.holders.find((h) => h.id === r.id)?.email?.toLowerCase(); if (!r.email && emailOk(e)) { r.email = e!; await db().query('UPDATE equity.holders SET email = $2 WHERE id = $1', [r.id, e]) } }

  let pipelineId: string | null = null, stageClosed: string | null = null, stageFirst: string | null = null
  if (d.pipeline) {
    if (d.pipeline.id === 'new') {
      if (!d.pipeline.new_name) throw apiError('invalid', 'Name the new pipeline.')
      pipelineId = (await one<{ id: string }>("INSERT INTO crm.pipelines (name, currency, instrument, status) VALUES ($1, 'USD', 'safe', 'open') RETURNING id", [d.pipeline.new_name])).id
      const STD: [string, string, string][] = [['Contacted', 'grey', 'open'], ['Meeting', 'blue', 'open'], ['Diligence', 'purple', 'open'], ['Term sheet', 'teal', 'committed'], ['Committed', 'amber', 'committed'], ['Closed', 'green', 'won'], ['Passed', 'red', 'lost']]
      for (const [i, s] of STD.entries()) await db().query('INSERT INTO crm.stages (pipeline_id, name, color, kind, sort) VALUES ($1,$2,$3,$4,$5)', [pipelineId, s[0], s[1], s[2], i])
    } else {
      if (!(await db().query('SELECT 1 FROM crm.pipelines WHERE id = $1', [d.pipeline.id])).rowCount) throw apiError('invalid', 'Choose a pipeline.')
      pipelineId = d.pipeline.id
    }
    const st = (await db().query<{ id: string; kind: string }>('SELECT id, kind FROM crm.stages WHERE pipeline_id = $1 ORDER BY sort', [pipelineId])).rows
    stageClosed = st.find((s) => s.kind === 'won')?.id ?? null; stageFirst = st[0]?.id ?? null
    if (!stageFirst) throw apiError('invalid', 'That pipeline has no stages.')
    if (d.pipeline.closed && !stageClosed) throw apiError('invalid', 'That pipeline has no closed (won) stage. Add one in Edit stages, or untick "Mark as closed".')
  }
  let listId: string | null = null
  if (d.contacts?.list_id === 'new') {
    const nm = d.contacts.new_list || 'Shareholders'
    listId = (await db().query<{ id: string }>('SELECT id FROM crm.lists WHERE lower(name) = lower($1)', [nm])).rows[0]?.id ?? (await one<{ id: string }>('INSERT INTO crm.lists (name) VALUES ($1) RETURNING id', [nm])).id
  } else if (d.contacts?.list_id) listId = d.contacts.list_id

  let toPipeline = 0, closed = 0, contacts = 0
  const skipped: { name: string; reason: string }[] = []
  for (const r of rows) {
    let contactId: string | null = null
    if (d.contacts) {
      if (!emailOk(r.email)) skipped.push({ name: r.name, reason: 'no email, so not added to Contacts' })
      else {
        contactId = (await one<{ id: string }>('INSERT INTO crm.contacts (name, email, subscribed) VALUES ($1, $2, true) ON CONFLICT (organization_id, email) DO UPDATE SET name = crm.contacts.name RETURNING id', [r.name, r.email!.toLowerCase()])).id
        if (listId) await db().query('INSERT INTO crm.list_members (list_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [listId, contactId])
        contacts++
      }
    }
    if (pipelineId) {
      if ((await db().query('SELECT 1 FROM crm.deals WHERE pipeline_id = $1 AND lower(investor) = lower($2)', [pipelineId, r.name])).rowCount) { skipped.push({ name: r.name, reason: 'already in that pipeline' }); continue }
      if (!contactId && emailOk(r.email)) contactId = (await db().query<{ id: string }>('SELECT id FROM crm.contacts WHERE lower(email) = lower($1)', [r.email])).rows[0]?.id ?? null
      const isClosed = d.pipeline!.closed && r.invested > 0
      const ref = r.conv_id ? { id: r.conv_id, kind: 'convertible' } : r.iss_id ? { id: r.iss_id, kind: 'issuance' } : null
      await db().query(`INSERT INTO crm.deals (pipeline_id, stage_id, investor, contact_id, amount, notes, valuation_cap, cap_basis, discount, equity_ref, equity_kind, equity_at)
        VALUES ($1,$2,$3,$4,$5,'From the cap table',$6,$7,$8,$9,$10,$11)`,
        [pipelineId, isClosed ? stageClosed : stageFirst, r.name.slice(0, 200), contactId, r.invested > 0 ? Math.round(r.invested * 100) / 100 : null, r.cap || null, r.cap ? (r.post === false ? 'pre' : 'post') : null, r.disc && r.disc < 100 ? r.disc : null,
          ref?.id ?? null, ref?.kind ?? null, ref ? new Date().toISOString() : null])
      toPipeline++; if (isClosed) closed++
    }
  }
  await audit({ event, actorUserId: user.userId, action: 'equity.to_crm', objectType: 'captable', objectId: ct, detail: { to_pipeline: toPipeline, closed, contacts } })
  return { ok: true, to_pipeline: toPipeline, closed, contacts, skipped, pipeline_id: pipelineId }
})
