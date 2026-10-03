// Governance rules: who signs for an entity, and how a resolution is decided.
export const SIGNING_ROLES = ['trustee', 'protector', 'director', 'signatory', 'member'] as const
export const PARTY_ROLES = ['settlor', 'trustee', 'successor_trustee', 'protector', 'beneficiary', 'director', 'officer', 'member', 'shareholder', 'signatory'] as const
export const isSigningRole = (role: string): boolean => (SIGNING_ROLES as readonly string[]).includes(role)

// Active signatories of an entity who have an Aidi OS account (matched by email).
export async function signatories(entityId: string): Promise<{ party_id: string; name: string; email: string; user_id: string | null }[]> {
  const r = await db().query<{ party_id: string; name: string; email: string; user_id: string | null }>(
    `SELECT DISTINCT ON (p.email) p.id AS party_id, p.name, p.email, u.id AS user_id
       FROM governance.parties p LEFT JOIN core.users u ON u.email = p.email AND u.status = 'active'
      WHERE p.entity_id = $1 AND p.email IS NOT NULL AND p.role = ANY($2::text[]) AND (p.end_date IS NULL OR p.end_date >= current_date)
      ORDER BY p.email, p.created_at`, [entityId, [...SIGNING_ROLES]])
  return r.rows
}

// Approved once enough signatories approve; rejected once approval can no longer be reached.
export function outcome(eligible: number, required: number, approvals: number, rejections: number): 'approved' | 'rejected' | null {
  if (approvals >= required) return 'approved'
  if (eligible - rejections < required) return 'rejected'
  return null
}
