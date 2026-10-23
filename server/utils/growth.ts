// Sales and marketing processes (Finvry): saving a process, and loading one with its deals or channel results, the
// results filled in from the rest of Finvry where the founder has not typed them (spend from Banking,
// customers and revenue from won deals sourced from the channel).
import type { H3Event } from 'h3'
import { z } from 'zod'
import { salesStats, marketingStats, withKeys, slug, SALES_TEMPLATES, MARKETING_TEMPLATE, type Process, type Stage, type ChannelMonth } from '~/shared/growth'

const StageIn = z.object({ key: z.string().max(40).optional(), name: z.string().trim().min(1).max(60), kind: z.enum(['open', 'won', 'lost']), target_pct: z.coerce.number().min(0).max(100).nullable().optional(), days: z.coerce.number().int().min(0).max(730).nullable().optional(), steps: z.array(z.string().trim().min(1).max(200)).max(20).default([]) })
const ChannelIn = z.object({ key: z.string().max(40).optional(), name: z.string().trim().min(1).max(60), monthly_budget: z.coerce.number().min(0).max(1e12).nullable().optional(), vendor_keys: z.array(z.string().max(80)).max(10).default([]) })
export const ProcessIn = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), name: z.string().trim().min(1).max(80).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  target_monthly: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0).max(1e12).nullable()).optional(), target_kind: z.enum(['revenue', 'deals', 'leads', 'customers']).optional(),
  stages: z.array(StageIn).max(15).optional(), channels: z.array(ChannelIn).max(20).optional(), template: z.string().max(30).optional() })

// Keys stay as they were (deals and results point at them); new stages and channels get one from their name.
const keyed = <T extends { key?: string; name: string }>(xs: T[]) => { const seen = new Set<string>(); return xs.map((x) => { let k = x.key && /^[a-z0-9_]{1,40}$/.test(x.key) ? x.key : slug(x.name); while (seen.has(k)) k = k.slice(0, 36) + '_' + (seen.size + 1); seen.add(k); return { ...x, key: k } }) }
export async function saveProcess(event: H3Event, kind: 'sales' | 'marketing', userId: string, body: unknown) {
  const b = ProcessIn.safeParse(body)
  if (!b.success) throw apiError('invalid', 'Check the process: each stage needs a name; percentages are 0 to 100.')
  const d = b.data
  if (d.delete && d.id) { await db().query('DELETE FROM growth.processes WHERE id = $1 AND kind = $2', [d.id, kind]); await audit({ event, actorUserId: userId, action: kind + '.process_delete', objectType: 'growth_process', objectId: d.id }); return { ok: true } }
  // A new process belongs to the company chosen at the top, in its currency; made on the group view, it is used across the group.
  const sc = await forecastScope(event), cur = d.currency ?? sc.currency
  let stages = d.stages ? keyed(d.stages) : null, channels = d.channels ? keyed(d.channels) : null
  if (!d.id && !stages) { const t = kind === 'marketing' ? MARKETING_TEMPLATE.stages : (SALES_TEMPLATES[d.template ?? 'b2b'] ?? SALES_TEMPLATES.b2b!).stages; stages = withKeys(t) }
  if (!d.id && kind === 'marketing' && !channels) channels = withKeys(MARKETING_TEMPLATE.channels)
  if (stages) {
    if (!stages.some((s) => s.kind === 'open')) throw apiError('invalid', 'Keep at least one open stage.')
    if (kind === 'sales' && !stages.some((s) => s.kind === 'won')) throw apiError('invalid', 'Keep a stage for won deals.')
  }
  const name = d.name ?? (kind === 'sales' ? (SALES_TEMPLATES[d.template ?? 'b2b']?.label ?? 'Sales') : 'Marketing')
  if (d.id) {
    const ex = (await db().query<{ stages: Stage[] }>('SELECT stages FROM growth.processes WHERE id = $1 AND kind = $2', [d.id, kind])).rows[0]
    if (!ex) throw apiError('not_found', 'Not found', 404)
    // A stage that still holds deals cannot be removed.
    if (stages && kind === 'sales') { const gone = ex.stages.filter((s) => !stages!.some((x) => x.key === s.key)).map((s) => s.key); if (gone.length) { const n = (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM growth.deals WHERE process_id = $1 AND stage_key = ANY($2::text[])', [d.id, gone])).rows[0]!.n; if (n) throw apiError('in_use', 'Move the ' + n + ' deal' + (n === 1 ? '' : 's') + ' out of the stages you removed first.') } }
    await db().query('UPDATE growth.processes SET name = coalesce($2, name), currency = coalesce($3, currency), target_monthly = CASE WHEN $4::boolean THEN $5 ELSE target_monthly END, target_kind = coalesce($6, target_kind), stages = coalesce($7, stages), channels = coalesce($8, channels), updated_at = now() WHERE id = $1',
      [d.id, d.name ?? null, d.currency ?? null, d.target_monthly !== undefined, d.target_monthly ?? null, d.target_kind ?? null, stages ? JSON.stringify(stages) : null, channels ? JSON.stringify(channels) : null])
    await audit({ event, actorUserId: userId, action: kind + '.process_update', objectType: 'growth_process', objectId: d.id })
    return { ok: true, id: d.id }
  }
  const id = (await one<{ id: string }>('INSERT INTO growth.processes (kind, name, currency, target_monthly, target_kind, stages, channels, created_by, entity_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [kind, name, cur, d.target_monthly ?? null, d.target_kind ?? (kind === 'marketing' ? 'customers' : 'revenue'), JSON.stringify(stages ?? []), JSON.stringify(channels ?? []), userId, sc.group ? null : sc.entity])).id
  await audit({ event, actorUserId: userId, action: kind + '.process_create', objectType: 'growth_process', objectId: id })
  return { ok: true, id }
}

type PRow = Process & { target_monthly: number | null }
// The company chosen at the top sees its own processes and those used across the group; the group view sees them all.
export interface GScope { group: boolean; entity: string | null; currency: string; companies: { id: string; name: string }[] }
async function processes(kind: 'sales' | 'marketing', sc?: GScope): Promise<(PRow & { entity_id: string | null })[]> {
  return (await db().query<PRow & { entity_id: string | null }>('SELECT id, kind, name, currency, target_monthly::float AS target_monthly, target_kind, stages, channels, entity_id FROM growth.processes WHERE kind = $1 AND ($2::uuid IS NULL OR entity_id IS NULL OR entity_id = $2) ORDER BY sort, created_at', [kind, sc && !sc.group ? sc.entity : null])).rows
}
const ownerName = (sc: GScope | undefined, id: string | null) => (id ? sc?.companies.find((c) => c.id === id)?.name ?? 'A company' : 'The whole group')
// Group view: each process (each company's and the group-wide ones), its pipeline and wins, and the total in the
// group's reporting currency.
async function salesRollup(sc: GScope, list: (PRow & { entity_id: string | null })[]) {
  const rows = []; let open = 0, weighted = 0, won90 = 0
  for (const p of list) {
    const deals = (await db().query<{ id: string; stage_key: string; value: number | null; recurring: boolean; created_at: string; closed_at: string | null; expected_close: string | null; source_channel: string | null; owner_id: string | null }>("SELECT id, stage_key, value::float, recurring, created_at::text, closed_at::text, to_char(expected_close, 'YYYY-MM-DD') AS expected_close, source_channel, owner_id FROM growth.deals WHERE process_id = $1", [p.id])).rows
    const moves = (await db().query<{ deal_id: string; from_stage: string | null; to_stage: string; at: string }>('SELECT m.deal_id, m.from_stage, m.to_stage, m.at::text FROM growth.deal_moves m JOIN growth.deals d ON d.id = m.deal_id WHERE d.process_id = $1', [p.id])).rows
    const st = salesStats(p, deals, moves), won = p.stages.find((s) => s.kind === 'won')?.key
    const w90 = deals.filter((d) => d.stage_key === won && d.closed_at && Date.now() - new Date(d.closed_at).getTime() < 90 * 86400000).reduce((t, d) => t + (d.value ?? 0), 0)
    const k = p.currency === sc.currency ? 1 : (await fxRate(p.currency, sc.currency)) ?? 0
    open += st.open_value * k; weighted += st.weighted * k; won90 += w90 * k
    rows.push({ id: p.id, name: p.name, company: ownerName(sc, p.entity_id), currency: p.currency, open: st.open_value, weighted: st.weighted, won_90d: Math.round(w90), win_rate: st.win_rate, deals: st.deals })
  }
  return { currency: sc.currency, rows, total: { open: Math.round(open), weighted: Math.round(weighted), won_90d: Math.round(won90) } }
}
export async function salesView(pid?: string, sc?: GScope) {
  const list = await processes('sales', sc), p = list.find((x) => x.id === pid) ?? list[0] ?? null
  const people = await orgPeople()
  // Sheets kept in step bring their deals in first (at most every six hours).
  if (p) await syncDue('sales_deals', p.id).catch(() => {})
  const channels = (await processes('marketing', sc)).flatMap((m) => m.channels.map((c) => ({ key: c.key, name: c.name })))
  const rollup = sc?.group && list.length ? await salesRollup(sc, list) : null
  if (!p) return { processes: [], process: null, deals: [], stats: null, people, channels, rollup, templates: Object.entries(SALES_TEMPLATES).map(([k, t]) => ({ key: k, label: t.label })) }
  const deals = (await db().query<{ id: string; name: string; contact: string | null; value: number | null; recurring: boolean; stage_key: string; owner_id: string | null; source_channel: string | null; expected_close: string | null; steps_done: Record<string, number[]>; notes: string | null; lost_reason: string | null; closed_at: string | null; created_at: string; updated_at: string }>(
    `SELECT id, name, contact, value::float, recurring, stage_key, owner_id, source_channel, to_char(expected_close, 'YYYY-MM-DD') AS expected_close, steps_done, notes, lost_reason, closed_at::text, created_at::text, updated_at::text FROM growth.deals WHERE process_id = $1 AND ($2::uuid IS NULL OR $3::uuid IS NOT NULL OR coalesce(entity_id, $4::uuid) = $2) ORDER BY updated_at DESC`, [p.id, sc && !sc.group ? sc.entity : null, p.entity_id, await companyEntityId()])).rows
  const ids = new Set(deals.map((x) => x.id))
  const moves = (await db().query<{ deal_id: string; from_stage: string | null; to_stage: string; at: string }>('SELECT m.deal_id, m.from_stage, m.to_stage, m.at::text FROM growth.deal_moves m JOIN growth.deals d ON d.id = m.deal_id WHERE d.process_id = $1 ORDER BY m.at', [p.id])).rows.filter((m) => ids.has(m.deal_id))
  return { processes: list.map((x) => ({ id: x.id, name: x.name, company: ownerName(sc, x.entity_id) })), process: { ...p, company: ownerName(sc, p.entity_id) }, deals, stats: salesStats(p, deals, moves), people, channels, rollup, templates: Object.entries(SALES_TEMPLATES).map(([k, t]) => ({ key: k, label: t.label })) }
}
export async function marketingView(pid?: string, monthsBack = 6, sc?: GScope) {
  const list = await processes('marketing', sc), p = list.find((x) => x.id === pid) ?? list[0] ?? null
  if (!p) return { processes: [], process: null, campaigns: [], rows: [], months: [], stats: null, avg_deal: null, vendors: [], rollup: null }
  await syncDue('marketing_months', p.id).catch(() => {})
  const now = new Date(), months = Array.from({ length: monthsBack }, (_, k) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack + 1 + k, 1)); return d.toISOString().slice(0, 7) })
  const typed = (await db().query<ChannelMonth & { id: string }>('SELECT id, channel_key, month, spend::float, visitors, leads, mqls, sqls, customers, revenue::float FROM growth.channel_months WHERE process_id = $1', [p.id])).rows
  // Filled in from the rest of Finvry when not typed: spend from the bank ledger (the channel's vendors), customers
  // and revenue from won deals sourced from the channel.
  const vk = p.channels.flatMap((c) => c.vendor_keys.map((v) => [v, c.key] as const)), vmap = new Map(vk)
  // Spend from the bank: the process's company's payments (every company's for a group-wide process), in its currency.
  const main = await companyEntityId(), rate = await rateTo(p.currency)
  const sraw = vk.length ? (await db().query<{ vendor_key: string; m: string; currency: string; amt: string }>("SELECT vendor_key, to_char(txn_date, 'YYYY-MM') AS m, currency, sum(amount)::text AS amt FROM banking.ledger WHERE direction = 'out' AND vendor_key = ANY($1::text[]) AND ($2::uuid IS NULL OR coalesce(entity_id, $3::uuid) = $2) GROUP BY 1, 2, 3", [vk.map(([v]) => v), p.entity_id, main]).catch(() => ({ rows: [] }))).rows : []
  const spend: { vendor_key: string; m: string; amt: string }[] = []; for (const x of sraw) spend.push({ ...x, amt: String(Number(x.amt) * await rate(x.currency)) })
  const won = (await db().query<{ source_channel: string; m: string; n: number; v: string }>(`SELECT d.source_channel, to_char(coalesce(d.closed_at, d.updated_at), 'YYYY-MM') AS m, count(*)::int AS n, coalesce(sum(d.value), 0)::text AS v FROM growth.deals d JOIN growth.processes p ON p.id = d.process_id
    WHERE d.source_channel IS NOT NULL AND ($1::uuid IS NULL OR coalesce(d.entity_id, p.entity_id, $2::uuid) = $1) AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.stages) s WHERE s->>'key' = d.stage_key AND s->>'kind' = 'won') GROUP BY 1, 2`, [p.entity_id, main])).rows
  const rows: (ChannelMonth & { auto: string[] })[] = []
  for (const c of p.channels) for (const m of months) {
    const t = typed.find((r) => r.channel_key === c.key && r.month === m), auto: string[] = []
    const r: ChannelMonth & { auto: string[] } = { channel_key: c.key, month: m, spend: t?.spend ?? null, visitors: t?.visitors ?? null, leads: t?.leads ?? null, mqls: t?.mqls ?? null, sqls: t?.sqls ?? null, customers: t?.customers ?? null, revenue: t?.revenue ?? null, auto }
    if (r.spend === null) { const s = spend.filter((x) => vmap.get(x.vendor_key) === c.key && x.m === m).reduce((a, x) => a + Number(x.amt), 0); if (s) { r.spend = Math.round(s); auto.push('spend') } }
    const w = won.find((x) => x.source_channel === c.key && x.m === m)
    if (w && r.customers === null) { r.customers = w.n; auto.push('customers') }
    if (w && r.revenue === null) { r.revenue = Math.round(Number(w.v)); auto.push('revenue') }
    rows.push(r)
  }
  const campaigns = (await db().query("SELECT id, name, channel_key, status, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, budget::float, spend::float, leads, customers, goal, steps, notes FROM growth.campaigns WHERE process_id = $1 ORDER BY status = 'done', starts_on DESC NULLS LAST, created_at DESC", [p.id])).rows
  const avg = (await db().query<{ v: string | null }>(`SELECT avg(d.value)::text AS v FROM growth.deals d JOIN growth.processes p ON p.id = d.process_id WHERE d.value > 0 AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.stages) s WHERE s->>'key' = d.stage_key AND s->>'kind' = 'won')`)).rows[0]?.v
  const vendors = (await db().query<{ vendor_key: string; vendor: string }>("SELECT vendor_key, max(vendor) AS vendor FROM banking.ledger WHERE direction = 'out' GROUP BY 1 ORDER BY sum(amount_base) DESC LIMIT 60").catch(() => ({ rows: [] }))).rows
  const full = months.slice(0, -1) // the current month is still running
  // Group view: every marketing process's last three full months, and the total in the reporting currency.
  let rollup: { currency: string; rows: { id: string; name: string; company: string; currency: string; spend: number; leads: number; customers: number; revenue: number }[]; total: { spend: number; leads: number; customers: number; revenue: number } } | null = null
  if (sc?.group) {
    const last3 = full.slice(-3), out = []; let ts = 0, tl = 0, tc = 0, tr = 0
    for (const x of list) {
      const r = (await db().query<{ spend: string | null; leads: string | null; customers: string | null; revenue: string | null }>('SELECT sum(spend)::text AS spend, sum(leads)::text AS leads, sum(customers)::text AS customers, sum(revenue)::text AS revenue FROM growth.channel_months WHERE process_id = $1 AND month = ANY($2::text[])', [x.id, last3])).rows[0]!
      const k = x.currency === sc.currency ? 1 : (await fxRate(x.currency, sc.currency)) ?? 0, sp = Number(r.spend ?? 0), rv = Number(r.revenue ?? 0)
      ts += sp * k; tr += rv * k; tl += Number(r.leads ?? 0); tc += Number(r.customers ?? 0)
      out.push({ id: x.id, name: x.name, company: ownerName(sc, x.entity_id), currency: x.currency, spend: Math.round(sp), leads: Number(r.leads ?? 0), customers: Number(r.customers ?? 0), revenue: Math.round(rv) })
    }
    rollup = { currency: sc.currency, rows: out, total: { spend: Math.round(ts), leads: tl, customers: tc, revenue: Math.round(tr) } }
  }
  return { processes: list.map((x) => ({ id: x.id, name: x.name, company: ownerName(sc, x.entity_id) })), process: { ...p, company: ownerName(sc, p.entity_id) }, campaigns, rows, months, stats: marketingStats(p, rows, full.slice(-3)), stats6: marketingStats(p, rows, full), avg_deal: avg ? Math.round(Number(avg)) : null, vendors, rollup }
}
