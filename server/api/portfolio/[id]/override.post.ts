// The team corrects a figure. The founder's number is kept; the correction is used everywhere, with who and why.
import { z } from 'zod'
const Body = z.object({
  period: z.string().refine(isPeriod, 'YYYY-MM'),
  metric: z.enum(METRIC_KEYS),
  value: z.number().finite().nullable(),
  note: z.string().trim().max(500).optional()
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Enter a number, or leave it empty to remove the correction.')
  if (b.data.value !== null && (b.data.note ?? '').length < 3) throw apiError('note', 'Add a short note explaining the correction.')
  const exists = await db().query('SELECT 1 FROM portfolio.companies WHERE id = $1', [id.data])
  if (exists.rowCount !== 1) throw apiError('not_found', 'Company not found', 404)
  await db().query(
    `INSERT INTO portfolio.metric_values (company_id, period, metric, override_value, override_note, override_by, override_at) VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (company_id, period, metric) DO UPDATE SET override_value = EXCLUDED.override_value, override_note = EXCLUDED.override_note,
       override_by = EXCLUDED.override_by, override_at = now(), updated_at = now()`,
    [id.data, periodToDate(b.data.period), b.data.metric, b.data.value, b.data.value === null ? null : b.data.note, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'portfolio.override', objectType: 'company', objectId: id.data, detail: { period: b.data.period, metric: b.data.metric, value: b.data.value } })
  return { ok: true }
})
