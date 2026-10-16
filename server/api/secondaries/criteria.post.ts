import { SEC_STAGES, fitOf } from '~/server/utils/secondaries'
// Save what we invest in (stages and focus sectors) and re-check open deals: ones now outside go to Passed with the
// reason; ones passed only for being outside the old criteria come back to New if they fit now.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ stages: z.array(z.enum(SEC_STAGES as [string, ...string[]])).min(1), sectors: z.array(z.string().trim().min(1).max(40)).min(1).max(20), expiry_days: z.coerce.number().int().min(1).max(365).default(21) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose at least one stage and one sector.')
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('secondaries', $2::jsonb) WHERE id = $1", [user.orgId, JSON.stringify(b.data)]))
  const rows = (await db().query<{ id: string; status: string; stage: string | null; sector: string | null; title: string; fits: boolean | null; fit_note: string | null }>("SELECT id, status, stage, sector, title, fits, fit_note FROM wm.secondaries WHERE status = 'new' OR (status = 'passed' AND fits = false)")).rows
  await db().query("UPDATE wm.secondaries SET closes_at = (received_at + make_interval(days => $1))::date WHERE closes_at IS NULL AND status IN ('new','reviewing','interested')", [b.data.expiry_days])
  let passed = 0, reopened = 0
  for (const r of rows) {
    const f = fitOf(r, b.data)
    const next = r.status === 'new' && f.fits === false ? 'passed' : r.status === 'passed' && f.fits !== false ? 'new' : r.status
    if (next !== r.status) next === 'passed' ? passed++ : reopened++
    await db().query('UPDATE wm.secondaries SET fits = $2, fit_note = $3, status = $4 WHERE id = $1', [r.id, f.fits, f.note, next])
  }
  await audit({ event, actorUserId: user.userId, action: 'secondaries.criteria', objectType: 'organization', objectId: user.orgId ?? undefined, detail: b.data })
  return { ok: true, passed, reopened }
})
