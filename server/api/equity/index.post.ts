// Add, change or remove one cap table record: { type, id?, delete?, data }. A new holder can be created inline by
// passing holder_name instead of holder_id.
import { z } from 'zod'
const d8 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const opt = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional().or(z.literal('').transform(() => null))
const S = {
  class: z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(['common', 'preferred']), liq_pref: z.coerce.number().min(0).max(10).default(1), participating: z.boolean().default(false), seniority: z.coerce.number().int().min(0).max(20).default(0), issue_price: opt(z.coerce.number().min(0)) }),
  holder: z.object({ name: z.string().trim().min(1).max(200), email: opt(z.string().trim().max(254)), kind: z.enum(['founder', 'employee', 'advisor', 'investor', 'other']) }),
  issuance: z.object({ holder_id: opt(z.string().uuid()), holder_name: opt(z.string().trim().max(200)), holder_kind: z.enum(['founder', 'employee', 'advisor', 'investor', 'other']).default('investor'), class_id: z.string().uuid(), shares: z.coerce.number().int().positive(), price: opt(z.coerce.number().min(0)), issued_on: d8, certificate: opt(z.string().trim().max(60)), notes: opt(z.string().trim().max(1000)) }),
  plan: z.object({ name: z.string().trim().min(1).max(120), reserved: z.coerce.number().int().min(0) }),
  grant: z.object({ plan_id: z.string().uuid(), holder_id: opt(z.string().uuid()), holder_name: opt(z.string().trim().max(200)), holder_kind: z.enum(['founder', 'employee', 'advisor', 'investor', 'other']).default('employee'), kind: z.enum(['option', 'rsu', 'restricted']).default('option'), shares: z.coerce.number().int().positive(), strike: opt(z.coerce.number().min(0)), granted_on: d8, vest_start: d8, vest_months: z.coerce.number().int().min(0).max(120), cliff_months: z.coerce.number().int().min(0).max(60), exercised: z.coerce.number().int().min(0).default(0), cancelled_on: opt(d8) }),
  convertible: z.object({ holder_id: opt(z.string().uuid()), holder_name: opt(z.string().trim().max(200)), holder_kind: z.enum(['founder', 'employee', 'advisor', 'investor', 'other']).default('investor'), kind: z.enum(['safe', 'note']), amount: z.coerce.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), valuation_cap: opt(z.coerce.number().positive()), discount_pct: opt(z.coerce.number().min(0).max(99)), post_money: z.boolean().default(true), mfn: z.boolean().default(false), interest_pct: opt(z.coerce.number().min(0).max(100)), issued_on: d8, maturity_on: opt(d8), status: z.enum(['outstanding', 'converted', 'cancelled']).default('outstanding'), safe_id: opt(z.string().uuid()) }) } as const
const TABLE: Record<keyof typeof S, string> = { class: 'equity.classes', holder: 'equity.holders', issuance: 'equity.issuances', plan: 'equity.plans', grant: 'equity.grants', convertible: 'equity.convertibles' }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const body = (await readBody(event)) as { type?: string; id?: string; delete?: boolean; data?: Record<string, unknown>; ct?: string }
  const ct = await capTableId(body.ct)
  const type = body.type as keyof typeof S
  if (!type || !(type in S)) throw apiError('invalid', 'Unknown record.')
  const id = body.id && /^[0-9a-f-]{36}$/.test(body.id) ? body.id : undefined
  if (body.delete && id) {
    try { await db().query('DELETE FROM ' + TABLE[type] + ' WHERE id = $1 AND captable_id = $2', [id, ct]) } catch (e) { if ((e as { code?: string }).code === '23503') throw apiError('in_use', 'Remove the shares issued in this class first.', 409); throw e }
    await audit({ event, actorUserId: user.userId, action: 'equity.' + type + '_deleted', objectType: 'equity_' + type, objectId: id }); return { ok: true }
  }
  const p = S[type].safeParse(body.data ?? {})
  if (!p.success) throw apiError('invalid', 'Check ' + (p.error.issues[0]?.path.join('.') || 'the details') + '.')
  const d = { ...p.data } as Record<string, unknown>
  // Records this one points at must be on the same cap table.
  for (const [k, t] of [['holder_id', 'holders'], ['class_id', 'classes'], ['plan_id', 'plans']] as const) if (d[k] && !(await db().query('SELECT 1 FROM equity.' + t + ' WHERE id = $1 AND captable_id = $2', [d[k], ct])).rowCount) throw apiError('invalid', 'Choose from this cap table.')
  if ('holder_id' in d || 'holder_name' in d) {
    if (!d.holder_id) { if (!d.holder_name) throw apiError('invalid', 'Choose or name the holder.'); d.holder_id = (await one<{ id: string }>('INSERT INTO equity.holders (captable_id, name, kind) VALUES ($3, $1, $2) RETURNING id', [d.holder_name, d.holder_kind, ct])).id }
    delete d.holder_name; delete d.holder_kind
  }
  const cols = Object.keys(d), vals = cols.map((k) => d[k] ?? null)
  const rid = id
    ? ((await db().query('UPDATE ' + TABLE[type] + ' SET ' + cols.map((c, i) => c + ' = $' + (i + 2)).join(', ') + ' WHERE id = $1 AND captable_id = $' + (cols.length + 2), [id, ...vals, ct])).rowCount ? id : null)
    : (await one<{ id: string }>('INSERT INTO ' + TABLE[type] + ' (captable_id, ' + cols.join(', ') + ') VALUES ($' + (cols.length + 1) + ', ' + cols.map((_, i) => '$' + (i + 1)).join(', ') + ') RETURNING id', [...vals, ct])).id
  if (!rid) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'equity.' + type + '_saved', objectType: 'equity_' + type, objectId: rid })
  await db().query('UPDATE equity.captables SET updated_at = now() WHERE id = $1', [ct])
  return { ok: true, id: rid }
})
