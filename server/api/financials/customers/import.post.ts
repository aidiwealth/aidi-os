// Save an upload after the founder has confirmed: merge the duplicate names they agreed to, then add the months
// (replacing the same months for the same customers) or replace all customer data.
import { z } from 'zod'
import type { ParsedCust } from '~/server/utils/customer-import'
const Body = z.object({ id: z.string().uuid(), merges: z.array(z.object({ names: z.array(z.string().max(200)).min(2).max(50), to: z.string().min(1).max(200) })).max(500).default([]),
  keep_repeats: z.boolean().default(false), mode: z.enum(['merge', 'replace']).default('merge'), link: z.object({ url: z.string().trim().min(10).max(600), name: z.string().trim().max(120).default('') }).optional(), auto: z.boolean().default(true) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event)); if (!b.success) throw apiError('invalid', 'Check the upload.')
  const d = b.data
  const imp = (await db().query<{ data: ParsedCust[]; status: string }>('SELECT data, status FROM financials.customer_imports WHERE id = $1', [d.id])).rows[0]
  if (!imp || imp.status !== 'preview') throw apiError('not_found', 'That upload has expired. Upload the file again.', 404)
  // A live link always holds the whole history, so it replaces what was saved.
  const r = await applyCustomers(imp.data, d.merges, d.keep_repeats, d.link ? 'replace' : d.mode)
  await rememberMerges(d.merges)
  if (d.link) await db().query(`INSERT INTO financials.customer_config (link_url, link_name, link_auto, link_synced_at, link_result) VALUES ($1, $2, $3, now(), $4::jsonb)
    ON CONFLICT (organization_id) DO UPDATE SET link_url = EXCLUDED.link_url, link_name = EXCLUDED.link_name, link_auto = EXCLUDED.link_auto, link_synced_at = now(), link_error = NULL, link_result = EXCLUDED.link_result`,
    [d.link.url, d.link.name || null, d.auto, JSON.stringify({ customers: r.customers, months: r.months, possible: [] })])
  // Once saved, the upload's copy of the rows is not needed (the customers hold them): only the summary is kept.
  await db().query("UPDATE financials.customer_imports SET status = 'applied', applied_at = now(), data = '[]'::jsonb, summary = summary || $2::jsonb WHERE id = $1", [d.id, JSON.stringify({ merged: d.merges.length, mode: d.link ? 'replace' : d.mode, saved: r.customers, link: !!d.link })])
  await db().query("DELETE FROM financials.customer_imports WHERE status = 'preview' AND created_at < now() - interval '1 day'")
  await audit({ event, actorUserId: user.userId, action: 'customers.import', objectType: 'customer_import', objectId: d.id, detail: { customers: r.customers, months: r.months, merges: d.merges.length, mode: d.mode, link: !!d.link } })
  return { ok: true, customers: r.customers, months: r.months, merged: d.merges.length }
})
