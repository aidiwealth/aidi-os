// Save the valuation: the discounts and basis, and the peers (ticked or not, figures corrected, added by hand).
import { z } from 'zod'
import { cleanPeer } from '~/shared/valuation'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const b = z.object({ ct: z.string().uuid().optional(),
    assumptions: z.object({ basis: z.enum(['revenue_ttm', 'run_rate', 'arr']), private_discount: z.coerce.number().min(0).max(90), market_discount: z.coerce.number().min(0).max(90), about: z.string().max(600).default(''), focus: z.string().max(300).default('') }).optional(),
    peers: z.array(z.record(z.string(), z.unknown())).max(40).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the valuation figures.')
  const ct = await capTableId(b.data.ct)
  const peers = b.data.peers?.map((p) => cleanPeer(p, p.added === 'founder' ? 'founder' : 'ai')).filter((p) => p.name)
  await db().query(`INSERT INTO equity.valuations (captable_id, assumptions, peers) VALUES ($1, coalesce($2::jsonb, '{}'::jsonb), coalesce($3::jsonb, '[]'::jsonb))
    ON CONFLICT (captable_id) DO UPDATE SET assumptions = CASE WHEN $2::jsonb IS NULL THEN equity.valuations.assumptions ELSE equity.valuations.assumptions || $2::jsonb END, peers = coalesce($3::jsonb, equity.valuations.peers), updated_at = now()`,
    [ct, b.data.assumptions ? JSON.stringify(b.data.assumptions) : null, peers ? JSON.stringify(peers) : null])
  await audit({ event, actorUserId: user.userId, action: 'equity.valuation_saved', objectType: 'captable', objectId: ct })
  return { ok: true }
})
