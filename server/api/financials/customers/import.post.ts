// Save an upload after the founder has confirmed: merge the duplicate names they agreed to, then add the months
// (replacing the same months for the same customers) or replace all customer data.
import { custKey } from '~/shared/customer-metrics'
import { z } from 'zod'
import type { ParsedCust } from '~/server/utils/customer-import'
const Body = z.object({ id: z.string().uuid(), merges: z.array(z.object({ names: z.array(z.string().max(200)).min(2).max(50), to: z.string().min(1).max(200) })).max(500).default([]),
  keep_repeats: z.boolean().default(false), mode: z.enum(['merge', 'replace']).default('merge') })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event)); if (!b.success) throw apiError('invalid', 'Check the upload.')
  const d = b.data
  const imp = (await db().query<{ data: ParsedCust[]; status: string; summary: Record<string, unknown> }>('SELECT data, status, summary FROM financials.customer_imports WHERE id = $1', [d.id])).rows[0]
  if (!imp || imp.status !== 'preview') throw apiError('not_found', 'That upload has expired. Upload the file again.', 404)
  const to = new Map<string, string>()
  for (const m of d.merges) for (const n of m.names) to.set(n, m.to)
  // Combine the file's customers under their final names.
  const merged = new Map<string, ParsedCust>()
  for (const c of imp.data) {
    const name = to.get(c.name) ?? c.name, k = custKey(name)
    const t = merged.get(k) ?? { name, rev: {} }
    for (const [m, v] of Object.entries(c.rev)) t.rev[m] = Math.round(((t.rev[m] ?? 0) + v) * 100) / 100
    if (d.keep_repeats && c.rep) for (const [m, v] of Object.entries(c.rep)) t.rev[m] = Math.round(((t.rev[m] ?? 0) + v) * 100) / 100
    for (const a of ['segment', 'sector', 'country', 'plan', 'started_on', 'acquisition_cost', 'gross_margin_pct'] as const) if (c[a] !== undefined && t[a] === undefined) (t as unknown as Record<string, unknown>)[a] = c[a]
    merged.set(k, t)
  }
  if (d.mode === 'replace') await db().query('DELETE FROM financials.customers')
  // Existing customers renamed by a merge: move their months to the kept name.
  for (const m of d.merges) {
    const keep = custKey(m.to)
    const others = m.names.map(custKey).filter((k) => k !== keep)
    if (!others.length) continue
    const target = (await db().query<{ id: string }>('INSERT INTO financials.customers (name, key) VALUES ($1,$2) ON CONFLICT (organization_id, key) DO UPDATE SET updated_at = now() RETURNING id', [m.to, keep])).rows[0]!.id
    const olds = (await db().query<{ id: string }>('SELECT id FROM financials.customers WHERE key = ANY($1::text[]) AND id <> $2', [others, target])).rows.map((r) => r.id)
    if (olds.length) {
      await db().query(`INSERT INTO financials.customer_revenue (customer_id, month, amount) SELECT $1, month, sum(amount) FROM financials.customer_revenue WHERE customer_id = ANY($2::uuid[]) GROUP BY month
        ON CONFLICT (customer_id, month) DO UPDATE SET amount = financials.customer_revenue.amount + EXCLUDED.amount`, [target, olds])
      await db().query(`UPDATE financials.customers t SET segment = coalesce(t.segment, o.segment), sector = coalesce(t.sector, o.sector), country = coalesce(t.country, o.country), plan = coalesce(t.plan, o.plan), started_on = coalesce(t.started_on, o.started_on), acquisition_cost = coalesce(t.acquisition_cost, o.acquisition_cost)
        FROM (SELECT * FROM financials.customers WHERE id = ANY($2::uuid[]) LIMIT 1) o WHERE t.id = $1`, [target, olds])
      await db().query('DELETE FROM financials.customers WHERE id = ANY($1::uuid[])', [olds])
    }
  }
  let customers = 0, months = 0
  for (const [k, c] of merged) {
    const id = (await db().query<{ id: string }>(`INSERT INTO financials.customers (name, key, segment, sector, country, plan, started_on, acquisition_cost, gross_margin_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (organization_id, key) DO UPDATE SET segment = coalesce(EXCLUDED.segment, financials.customers.segment), sector = coalesce(EXCLUDED.sector, financials.customers.sector), country = coalesce(EXCLUDED.country, financials.customers.country),
        plan = coalesce(EXCLUDED.plan, financials.customers.plan), started_on = coalesce(EXCLUDED.started_on, financials.customers.started_on), acquisition_cost = coalesce(EXCLUDED.acquisition_cost, financials.customers.acquisition_cost),
        gross_margin_pct = coalesce(EXCLUDED.gross_margin_pct, financials.customers.gross_margin_pct), updated_at = now() RETURNING id`,
      [c.name, k, c.segment ?? null, c.sector ?? null, c.country ?? null, c.plan ?? null, c.started_on ?? null, c.acquisition_cost ?? null, c.gross_margin_pct ?? null])).rows[0]!.id
    const ms = Object.keys(c.rev)
    if (ms.length) await db().query(`INSERT INTO financials.customer_revenue (customer_id, month, amount) SELECT $1, (m || '-01')::date, a FROM unnest($2::text[], $3::numeric[]) AS x(m, a)
      ON CONFLICT (customer_id, month) DO UPDATE SET amount = EXCLUDED.amount`, [id, ms, ms.map((m) => c.rev[m])])
    customers++; months += ms.length
  }
  await db().query("UPDATE financials.customer_imports SET status = 'applied', applied_at = now(), summary = summary || $2::jsonb WHERE id = $1", [d.id, JSON.stringify({ merged: d.merges.length, mode: d.mode, saved: customers })])
  await db().query("DELETE FROM financials.customer_imports WHERE status = 'preview' AND created_at < now() - interval '2 days'")
  await audit({ event, actorUserId: user.userId, action: 'customers.import', objectType: 'customer_import', objectId: d.id, detail: { customers, months, merges: d.merges.length, mode: d.mode } })
  return { ok: true, customers, months, merged: d.merges.length }
})
