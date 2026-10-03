// Pipeline rules shared by the API routes.
export const STAGES = ['screening', 'first_call', 'diligence', 'ic', 'invested', 'passed'] as const
export type Stage = typeof STAGES[number]
export const IC_APPROVALS_REQUIRED = 2

export async function icTally(dealId: string): Promise<{ approvals: number; rejections: number }> {
  const r = await db().query<{ approvals: number; rejections: number }>(
    `SELECT count(*) FILTER (WHERE v.vote = 'approve')::int AS approvals, count(*) FILTER (WHERE v.vote = 'reject')::int AS rejections
       FROM deals.ic_votes v
      WHERE v.deal_id = $1
        AND EXISTS (SELECT 1 FROM core.user_roles r JOIN core.users u ON u.id = r.user_id WHERE r.user_id = v.voter_id AND r.role_code = 'gp' AND u.status = 'active' AND EXISTS (SELECT 1 FROM core.memberships m WHERE m.user_id = r.user_id AND m.status = 'active'))`, [dealId])
  return r.rows[0] ?? { approvals: 0, rejections: 0 }
}
