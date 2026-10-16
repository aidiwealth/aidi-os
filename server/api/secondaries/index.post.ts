import { SecScreen } from '~/server/utils/secondary-screen'
// Add an opportunity by hand, or update one (status, amount, notes, details).
import { z } from 'zod'
const num = z.preprocess((v) => (typeof v === 'string' ? (v.replace(/[,\s$]/g, '') || null) : v), z.coerce.number().min(0).nullable()).optional()
const txt = (n: number) => z.string().trim().max(n).optional().nullable()
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), title: z.string().trim().min(1).max(500).optional(), company: txt(200), sector: txt(120), stage: txt(60), lead: txt(300), co_investors: txt(300),
    min_investment: num, valuation: txt(120), url: z.string().trim().max(1000).regex(/^(https?:\/\/.+)?$/).optional().nullable(), status: z.enum(['new', 'reviewing', 'interested', 'invested', 'passed', 'expired']).optional(), closes_at: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional().nullable(),
    amount: num, notes: txt(5000), source: z.enum(['meridian', 'wefunder', 'other']).optional(), client_visible: z.boolean().optional(), website: z.string().trim().max(300).optional().nullable(), logo_doc_id: z.string().uuid().optional().nullable(), company_info: z.record(z.string(), z.unknown()).optional().nullable(), ai_screen: SecScreen.optional().nullable() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the details' + (b.error.issues[0]?.path[0] ? ' (' + String(b.error.issues[0].path[0]).replace('_', ' ') + ')' : '') + '.')
  const { id, ...d } = b.data
  if (!id && !d.title) throw apiError('invalid', 'Describe the opportunity.')
  const cols = Object.keys(d).filter((k) => (d as Record<string, unknown>)[k] !== undefined)
  const vals = cols.map((k) => { const v = (d as Record<string, unknown>)[k]; return v === '' ? null : (k === 'company_info' || k === 'ai_screen') && v ? JSON.stringify(v) : v })
  if (id) {
    if (!cols.length) return { ok: true, id }
    const r = await db().query(`UPDATE wm.secondaries SET ${cols.map((c, i) => c + ' = $' + (i + 2)).join(', ')}, updated_by = $${cols.length + 2}, updated_at = now() WHERE id = $1`, [id, ...vals, user.userId])
    if (!r.rowCount) throw apiError('not_found', 'Not found', 404)
    return { ok: true, id }
  }
  const r = await one<{ id: string }>(`INSERT INTO wm.secondaries (${cols.join(', ')}, updated_by${d.ai_screen ? ', ai_screened_at' : ''}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}, $${cols.length + 1}${d.ai_screen ? ', now()' : ''}) RETURNING id`, [...vals, user.userId])
  return { ok: true, id: r.id }
})
