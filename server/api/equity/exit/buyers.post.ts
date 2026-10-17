// Find potential buyers with AI (in the background; the Exit tab follows it). Buyers already on the list keep their
// status and notes; the AI's worst / base / best multiples are offered alongside, not applied.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  await rateLimit('exit_buyers', user.userId, 10, 60 * 60 * 1000)
  const b = z.object({ ct: z.string().uuid().optional(), focus: z.string().trim().max(300).default(''), about: z.string().trim().max(600).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the search details.')
  const ct = await capTableId(b.data.ct)
  const running = (await db().query("SELECT 1 FROM equity.exit_plans WHERE captable_id = $1 AND search_status = 'running' AND search_started_at > now() - interval '6 minutes'", [ct])).rowCount
  if (running) return { ok: true, running: true }
  await db().query(`INSERT INTO equity.exit_plans (captable_id, search_status, search_started_at) VALUES ($1, 'running', now())
    ON CONFLICT (captable_id) DO UPDATE SET search_status = 'running', search_started_at = now(), search_error = NULL`, [ct])
  const org = await currentOrg()
  const page = (await db().query<{ headline: string | null; about: string | null; website: string | null }>('SELECT headline, about, website FROM financials.public_pages LIMIT 1').catch(() => ({ rows: [] }))).rows[0]
  const basis = await revenueBasis()
  const run = (async () => {
    try {
      const prev = (await db().query<{ buyers: Buyer[] }>('SELECT buyers FROM equity.exit_plans WHERE captable_id = $1', [ct])).rows[0]?.buyers ?? []
      const fmt = (v: number | null) => (v == null ? 'n/a' : basis.currency + ' ' + Math.round(v).toLocaleString('en-US'))
      const r = await findBuyers({ company: org?.name ?? 'the company', about: b.data.about || [page?.headline, page?.about].filter(Boolean).join(' — ').replace(/<[^>]+>/g, ' ').slice(0, 600), website: page?.website ?? '', focus: b.data.focus,
        metrics: ['ARR ' + fmt(basis.arr) + (basis.arr_source ? ' (' + basis.arr_source + ')' : ''), 'revenue ' + fmt(basis.revenue_ttm) + (basis.ttm_source ? ' (' + basis.ttm_source + ')' : ''), basis.ebitda_ttm != null ? 'EBITDA ' + fmt(basis.ebitda_ttm) : '', basis.growth_pct != null ? 'growth ' + basis.growth_pct + '% a year' : ''].filter(Boolean).join('; '), existing: prev.map((x) => x.name) })
      const now = new Date().toISOString(), key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
      const merged = [...prev]
      for (const x of r.buyers) { const c = cleanBuyer(x, now); if (!c.name) continue; const i = merged.findIndex((p) => key(p.name) === key(c.name)); if (i >= 0) merged[i] = cleanBuyer(x, now, merged[i]); else merged.push(c) }
      await db().query(`UPDATE equity.exit_plans SET buyers = $2, searched_at = now(), search_status = 'idle', search_note = $3,
        assumptions = assumptions || jsonb_build_object('ai_multiples', $4::jsonb), updated_at = now() WHERE captable_id = $1`,
        [ct, JSON.stringify(merged.slice(0, 60)), (r.searched ? 'Found with a web search.' : 'From the AI\'s own knowledge (web search was not available); check websites and contacts.') + (r.notes ? ' ' + r.notes : ''), JSON.stringify(r.multiples)])
    } catch (err) {
      console.error('[exit] buyers', (err as Error).message)
      const msg = (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'The search could not finish. Try again in a minute.'
      await db().query("UPDATE equity.exit_plans SET search_status = 'failed', search_error = $2 WHERE captable_id = $1", [ct, msg.slice(0, 300)]).catch(() => {})
    }
  })()
  event.waitUntil?.(run)
  await audit({ event, actorUserId: user.userId, action: 'equity.exit_buyer_search', objectType: 'captable', objectId: ct })
  return { ok: true, running: true }
})
