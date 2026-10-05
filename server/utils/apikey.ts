// Data API keys: "fv_live_" + random secret; only a hash is stored. Keys are per workspace with read and/or write scope.
import { createHash, randomBytes } from 'node:crypto'
export function newApiKey(): { key: string; prefix: string; hash: string } {
  const key = 'fv_live_' + randomBytes(24).toString('base64url')
  return { key, prefix: key.slice(0, 12), hash: createHash('sha256').update(key).digest('hex') }
}
export async function requireApiKey(event: Parameters<typeof getRequestHeader>[0], scope: 'read' | 'write'): Promise<{ orgId: string; kind: string; keyId: string }> {
  const h = getRequestHeader(event, 'authorization') ?? ''
  const key = h.replace(/^Bearer\s+/i, '').trim()
  if (!/^fv_live_[A-Za-z0-9_-]{20,}$/.test(key)) throw apiError('unauthorized', 'Send your API key as: Authorization: Bearer fv_live_…', 401)
  rateLimit('api_key', key.slice(0, 20), 600, 60 * 1000)
  const k = (await asPlatform(() => db().query<{ id: string; organization_id: string; scopes: string[]; kind: string; status: string }>(
    'SELECT k.id, k.organization_id, k.scopes, o.kind, o.status FROM core.api_keys k JOIN core.organizations o ON o.id = k.organization_id WHERE k.key_hash = $1 AND k.revoked_at IS NULL', [createHash('sha256').update(key).digest('hex')]))).rows[0]
  if (!k || ['suspended', 'closed'].includes(k.status)) throw apiError('unauthorized', 'This API key is not valid.', 401)
  if (!k.scopes.includes(scope)) throw apiError('forbidden', 'This API key does not have ' + scope + ' access.', 403)
  if (k.kind !== 'company') { const on = (await asPlatform(() => db().query<{ v: string | null }>("SELECT settings->>'api_enabled' AS v FROM core.organizations WHERE id = $1", [k.organization_id]))).rows[0]?.v; if (on !== 'true') throw apiError('forbidden', 'API access is switched off for this workspace.', 403) }
  setOrgContext(k.organization_id)
  await asPlatform(() => db().query('UPDATE core.api_keys SET last_used_at = now() WHERE id = $1', [k.id])).catch(() => {}) // awaited: the platform switch must end before workspace queries run
  return { orgId: k.organization_id, kind: k.kind, keyId: k.id }
}
export async function apiSubject(kind: string, given?: unknown): Promise<string> {
  if (kind === 'company') { const ent = await companyEntityId(); if (!ent) throw apiError('invalid', 'Your company has no entity yet.'); return 'entity:' + ent }
  const s = String(given ?? '')
  if (!/^(entity|company):[0-9a-f-]{36}$/.test(s)) throw apiError('invalid', 'Pass subject as entity:<id> or company:<id>.')
  return s
}
