// Save a SAFE's terms (post-money valuation cap and/or discount, MFN, pro rata side letter).
import { z } from 'zod'
const n = z.union([z.coerce.number().min(0), z.literal('').transform(() => null), z.null()]).optional()
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ round_id: z.string().uuid().optional(), company_name: z.string().trim().min(1).max(200), company_state: z.string().trim().min(1).max(60), investor_name: z.string().trim().min(1).max(200), investor_email: z.string().trim().max(254).default(''),
    amount: z.coerce.number().positive(), currency: z.enum(['USD', 'NGN']), valuation_cap: n, discount: n, mfn: z.boolean().default(false), pro_rata: z.boolean().default(false),
    signatory_name: z.string().trim().min(1).max(200), signatory_title: z.string().trim().min(1).max(120), safe_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the SAFE details.')
  const d = b.data
  if (!d.valuation_cap && !d.discount && !d.mfn) throw apiError('invalid', 'Set a valuation cap, a discount, or choose MFN only.')
  const r = await one<{ id: string }>(`INSERT INTO fundraise.safes (round_id, company_name, company_state, investor_name, investor_email, amount, currency, valuation_cap, discount, mfn, pro_rata, signatory_name, signatory_title, safe_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, [d.round_id ?? null, d.company_name, d.company_state, d.investor_name, d.investor_email || null, d.amount, d.currency, d.valuation_cap ?? null, d.discount ?? null, d.mfn, d.pro_rata, d.signatory_name, d.signatory_title, d.safe_date])
  return { ok: true, id: r.id }
})
