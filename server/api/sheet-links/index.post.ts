// Saves a linked sheet (new or edited) and reads it straight away.
import { z } from 'zod'
const Body = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), url: z.string().trim().min(10).max(600), target: z.enum(['financials', 'forecast']),
  subject: z.string().max(80).optional(), forecast_id: z.string().uuid().optional(), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), sheet: z.string().max(120),
  mapping: z.array(z.object({ label: z.string().max(90), to: z.string().max(40) })).max(150), auto: z.boolean().default(true) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Give the link a name and choose where its rows go.')
  const d = b.data
  await requireModule(event, d.target === 'forecast' ? 'forecast' : 'financials')
  const keys = new Set(TARGET_KEYS[d.target]().map((k) => k.key))
  const mapping = d.mapping.filter((m) => m.to && keys.has(m.to))
  if (!mapping.length) throw apiError('invalid', 'Choose at least one row to use.')
  const dupe = mapping.filter((m) => m.to !== 'kpi').map((m) => m.to).find((k, i, a) => a.indexOf(k) !== i)
  if (dupe) throw apiError('invalid', 'Two rows go to the same line (' + (TARGET_KEYS[d.target]().find((k) => k.key === dupe)?.label ?? dupe) + '). Choose one.')
  if (d.target === 'financials') { if (!d.subject || d.subject === 'group') throw apiError('invalid', 'Choose the company or entity.'); await subjectName(d.subject) }
  else if (!d.forecast_id || !(await db().query('SELECT 1 FROM financials.forecasts WHERE id = $1', [d.forecast_id])).rows[0]) throw apiError('invalid', 'Choose a saved forecast.')
  const args = [d.name, d.url, d.target, d.target === 'financials' ? d.subject : null, d.target === 'forecast' ? d.forecast_id : null, d.currency, d.sheet, JSON.stringify(mapping), d.auto]
  const id = d.id
    ? (await db().query<{ id: string }>('UPDATE financials.sheet_links SET name = $2, url = $3, target = $4, subject = $5, forecast_id = $6, currency = $7, sheet = $8, mapping = $9, auto = $10 WHERE id = $1 RETURNING id', [d.id, ...args])).rows[0]?.id
    : (await one<{ id: string }>('INSERT INTO financials.sheet_links (name, url, target, subject, forecast_id, currency, sheet, mapping, auto, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [...args, user.userId])).id
  if (!id) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: d.id ? 'sheet_link.update' : 'sheet_link.create', objectType: 'sheet_link', objectId: id, detail: { target: d.target, rows: mapping.length } })
  const l = (await one<LinkRow>(`SELECT ${LINK_COLS} FROM financials.sheet_links WHERE id = $1`, [id]))
  const res = await syncLink(l, user.userId).catch((e) => ({ error: (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not read the sheet.' }))
  return { ok: true, id, ...res }
})
