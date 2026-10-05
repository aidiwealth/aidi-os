// Create an API key (shown once) or revoke one.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ name: z.string().trim().min(1).max(80).optional(), write: z.boolean().default(false), revoke: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the key.')
  if (b.data.revoke) { await db().query('UPDATE core.api_keys SET revoked_at = now() WHERE id = $1', [b.data.revoke]); await audit({ event, actorUserId: user.userId, action: 'api_key.revoke', objectType: 'api_key', objectId: b.data.revoke }); return { ok: true } }
  if (!b.data.name) throw apiError('invalid', 'Name the key.')
  const k = newApiKey()
  const id = (await one<{ id: string }>('INSERT INTO core.api_keys (name, prefix, key_hash, scopes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [b.data.name, k.prefix, k.hash, b.data.write ? ['read', 'write'] : ['read'], user.userId])).id
  await audit({ event, actorUserId: user.userId, action: 'api_key.create', objectType: 'api_key', objectId: id, detail: { write: b.data.write } })
  return { ok: true, id, key: k.key }
})
