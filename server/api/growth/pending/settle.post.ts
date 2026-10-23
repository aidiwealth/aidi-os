// Accept the updates held for review (they are written in) or dismiss them.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const b = z.object({ id: z.string().uuid(), accept: z.boolean() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const k = (await db().query<{ kind: LinkKind }>('SELECT kind FROM growth.pending_imports WHERE id = $1', [b.data.id])).rows[0]
  if (!k) throw apiError('not_found', 'That update was already dealt with.', 404)
  const user = await requireKind(event, k.kind)
  const r = await settleImport(b.data.id, b.data.accept, user.userId)
  await audit({ event, actorUserId: user.userId, action: b.data.accept ? 'growth.import' : 'growth.import_dismiss', objectType: 'growth_import', detail: { kind: r.kind, added: r.added, updated: r.updated, linked: !!r.link } })
  return { ok: true, ...r }
})
