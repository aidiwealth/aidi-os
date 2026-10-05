// Create an API key (shown once) or revoke one.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ name: z.string().trim().min(1).max(80).optional(), write: z.boolean().default(false), revoke: z.string().uuid().optional(), enabled: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the key.')
  const org = (await currentOrg())!
  if (b.data.enabled !== undefined) {
    if (org.kind === 'company') throw apiError('invalid', 'The Data API is always available to companies.')
    if (!user.roles.includes('admin')) throw apiError('forbidden', 'Only an admin can change API access.', 403)
    await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('api_enabled', $2::text) WHERE id = $1", [org.id, String(b.data.enabled)]))
    if (!b.data.enabled) await db().query('UPDATE core.api_keys SET revoked_at = now() WHERE revoked_at IS NULL')
    await audit({ event, actorUserId: user.userId, action: 'api.' + (b.data.enabled ? 'enable' : 'disable'), objectType: 'organization', objectId: org.id })
    return { ok: true }
  }
  if (org.kind !== 'company' && !(org.settings.api_enabled === 'true' || org.settings.api_enabled === true)) throw apiError('forbidden', 'API access is switched off for this workspace.', 403)
  if (b.data.revoke) { await db().query('UPDATE core.api_keys SET revoked_at = now() WHERE id = $1', [b.data.revoke]); await audit({ event, actorUserId: user.userId, action: 'api_key.revoke', objectType: 'api_key', objectId: b.data.revoke }); return { ok: true } }
  if (!b.data.name) throw apiError('invalid', 'Name the key.')
  const k = newApiKey()
  const id = (await one<{ id: string }>('INSERT INTO core.api_keys (name, prefix, key_hash, scopes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [b.data.name, k.prefix, k.hash, b.data.write ? ['read', 'write'] : ['read'], user.userId])).id
  await audit({ event, actorUserId: user.userId, action: 'api_key.create', objectType: 'api_key', objectId: id, detail: { write: b.data.write } })
  return { ok: true, id, key: k.key }
})
