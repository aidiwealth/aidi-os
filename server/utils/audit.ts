import type { H3Event } from 'h3'

export interface AuditInput {
  event?: H3Event
  actorUserId: string | null
  action: string
  objectType?: string
  objectId?: string
  entityId?: string
  detail?: Record<string, unknown>
}

// Append to core.audit_log. Never swallow a failure: an action that cannot be audited must not succeed.
export async function audit(input: AuditInput): Promise<void> {
  const ip = input.event ? (getRequestIP(input.event, { xForwardedFor: true }) ?? null) : null
  await db().query(
    'INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, entity_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [input.actorUserId, input.action, input.objectType ?? null, input.objectId ?? null, input.entityId ?? null,
     JSON.stringify(input.detail ?? {}), ip]
  )
}
