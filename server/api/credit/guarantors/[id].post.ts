// Re-run a guarantor's credit check (BVN), or remove the guarantor.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ action: z.enum(['check', 'delete']) }).safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Invalid request.')
  const g = (await db().query<{ borrower_id: string; bvn_enc: string | null }>('SELECT borrower_id, bvn_enc FROM credit.guarantors WHERE id = $1', [id])).rows[0]
  if (!g) throw apiError('not_found', 'Not found', 404)
  if (b.data.action === 'delete') { await db().query('DELETE FROM credit.guarantors WHERE id = $1', [id]); return { ok: true } }
  if (!g.bvn_enc) throw apiError('invalid', 'Add the guarantor\'s BVN to run a check.')
  return { ok: true, check: await runCheck(g.borrower_id, id, 'individual', decryptText(g.bvn_enc), user.userId) }
})
