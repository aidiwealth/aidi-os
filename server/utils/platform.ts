// The Finvry platform console: Aidi staff manage customers, plans and subscriptions. Commercial data only:
// counts and totals, never a customer's deals, documents, people or money. Available only on the Aidi OS address.
import type { H3Event } from 'h3'

export async function requirePlatform(event: H3Event, write = false): Promise<SessionUser & { staffRole: string }> {
  const s = await requireUser(event)
  if (!s.platform || hostBrand(event) !== 'aidi') throw apiError('not_found', 'Not found', 404)
  const r = await asPlatform(() => db().query<{ role: string }>('SELECT role FROM core.platform_staff WHERE user_id = $1', [s.userId]))
  const role = r.rows[0]?.role
  if (!role) throw apiError('not_found', 'Not found', 404)
  if (write && role === 'support') throw apiError('forbidden', 'Support staff can view but not change customers.', 403)
  return { ...s, staffRole: role }
}

// Platform actions are logged in the customer's own audit trail, so they can see what Aidi staff changed.
export async function platformAudit(event: H3Event, actorUserId: string | null, action: string, orgId: string | null, detail: Record<string, unknown> = {}): Promise<void> {
  await asPlatform(() => db().query('INSERT INTO core.audit_log (organization_id, actor_user_id, action, object_type, object_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [orgId, actorUserId, 'platform.' + action, 'organization', orgId, JSON.stringify(detail), getRequestIP(event, { xForwardedFor: true }) ?? null]))
}

export const ORG_KINDS = ['company'] as const
export const ORG_STATUSES = ['trial', 'active', 'past_due', 'suspended', 'closed'] as const
