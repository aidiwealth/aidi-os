// Add the investors the founder picked from an imported list: each in the first stage, with its kind (equity, grant,
// debt), deadline, how likely it is to invest and why, the list's extra columns, and a contact when an email was given.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  await requireModule(event, 'fundraising')
  const pid = String(getRouterParam(event, 'id') ?? '')
  const s = (n: number) => z.string().max(n).default('')
  const b = z.object({ rows: z.array(z.object({ name: z.string().trim().min(1).max(200), kind: z.enum(['investor', 'grant']).default('investor'), instrument: z.enum(['safe', 'priced', 'convertible_note', 'grant', 'debt']).nullable().default(null),
    category: s(120), region: s(120), type: s(120), stage: s(120), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null), deadline_text: s(80), priority: s(20), notes: s(900), link: s(300), contact_name: s(160), contact_email: s(254), warm_intro: s(300),
    likelihood: z.number().int().min(0).max(100).nullable().default(null), reason: s(200) })).min(1).max(400) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Pick the investors to add.')
  const first = (await db().query<{ id: string; instrument: string }>('SELECT s.id, p.instrument FROM crm.stages s JOIN crm.pipelines p ON p.id = s.pipeline_id WHERE p.id = $1 ORDER BY s.sort LIMIT 1', [/^[0-9a-f-]{36}$/.test(pid) ? pid : null])).rows[0]
  if (!first) throw apiError('not_found', 'Pipeline not found.', 404)
  const have = new Set((await db().query<{ k: string }>('SELECT lower(investor) AS k FROM crm.deals WHERE pipeline_id = $1', [pid])).rows.map((r) => r.k))
  let added = 0, skipped = 0
  const org = (await currentOrg())!.id
  for (const r of b.data.rows) {
    if (have.has(r.name.toLowerCase())) { skipped++; continue }
    // An equity investor in a grants or debt pipeline is marked as equity (SAFE), so it is not counted as a grant.
    const inst = r.instrument ?? (r.kind === 'grant' ? 'grant' : first.instrument === 'grant' || first.instrument === 'debt' ? 'safe' : null)
    let contact: string | null = null
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contact_email)) contact = (await one<{ id: string }>('INSERT INTO crm.contacts (name, email, firm) VALUES ($1, $2, $3) ON CONFLICT (organization_id, email) DO UPDATE SET firm = coalesce(crm.contacts.firm, EXCLUDED.firm) RETURNING id', [r.contact_name || r.name, r.contact_email.toLowerCase(), r.name])).id
    const meta = Object.fromEntries(Object.entries({ category: r.category, region: r.region, type: r.type, stage_window: r.stage, deadline: r.deadline ? '' : r.deadline_text, priority: r.priority, link: /^https?:\/\//i.test(r.link) ? r.link : '', warm_intro: r.warm_intro }).filter(([, v]) => v))
    await db().query('INSERT INTO crm.deals (pipeline_id, stage_id, investor, contact_id, notes, instrument, deadline, likelihood, likelihood_note, meta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [pid, first.id, r.name, contact, r.notes || null, inst, r.deadline, r.likelihood, r.reason || null, JSON.stringify(meta)])
    have.add(r.name.toLowerCase()); added++
    if (r.kind === 'investor') await noteInvestor(org, r.name).catch(() => {})
  }
  return { ok: true, added, skipped }
})
