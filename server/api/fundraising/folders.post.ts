// Data room folders. Every change is one action:
//   create  { room_id, parent_id?, name, link_url? }   a category, a sub-folder, or a link to a folder elsewhere
//   update  { id, name?, link_url? }                    rename it, or change where a link goes
//   order   { ids }                                     these folders (one level) in this order
//   move    { id, parent_id?, room_id? }                put it inside another folder, at the top level, or in another
//                                                       room (with everything in it)
//   own     { id }                                      make it a data room of its own (its sub-folders become categories)
//   delete  { id }                                      only once it holds nothing
import { z } from 'zod'
const uuid = z.string().uuid()
const url = z.string().trim().max(2000).regex(/^https?:\/\//i, 'Use a full link, starting https://')
const B = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), room_id: uuid, parent_id: uuid.nullish(), name: z.string().trim().min(1).max(60), link_url: url.optional() }),
  z.object({ action: z.literal('update'), id: uuid, name: z.string().trim().min(1).max(60).optional(), link_url: url.optional() }),
  z.object({ action: z.literal('order'), ids: z.array(uuid).min(1).max(500) }),
  z.object({ action: z.literal('move'), id: uuid, parent_id: uuid.nullish(), room_id: uuid.optional() }),
  z.object({ action: z.literal('own'), id: uuid }),
  z.object({ action: z.literal('delete'), id: uuid })])
interface Fo { id: string; room_id: string; parent_id: string | null; name: string; link_url: string | null }
const getF = async (id: string) => (await db().query<Fo>('SELECT id, room_id, parent_id, name, link_url FROM fundraise.folders WHERE id = $1', [id])).rows[0]
const subtree = async (id: string) => (await db().query<{ id: string }>('WITH RECURSIVE t AS (SELECT id FROM fundraise.folders WHERE id = $1 UNION ALL SELECT f.id FROM fundraise.folders f JOIN t ON f.parent_id = t.id) SELECT id FROM t', [id])).rows.map((r) => r.id)
const nextPos = async (room: string, parent: string | null) => Number((await db().query<{ p: number }>('SELECT coalesce(max(position) + 1, 0)::int AS p FROM fundraise.folders WHERE room_id = $1 AND parent_id IS NOT DISTINCT FROM $2', [room, parent])).rows[0]?.p ?? 0)
// Files keep their top-level category's name (and, after a move to another room, that room): set in one go so the
// folder and the name never disagree.
const resync = (ids: string[], room: string | null = null) => resyncFiles(ids, room)
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const p = B.safeParse(await readBody(event))
  if (!p.success) throw apiError('invalid', p.error.issues[0]?.message?.startsWith('Use a full') ? p.error.issues[0].message : 'Check the name and link.')
  const d = p.data
  const done = async (id: string | null, detail: Record<string, unknown>) => { await audit({ event, actorUserId: user.userId, action: 'fundraising.folder_' + d.action, objectType: 'data_room_folder', objectId: id ?? undefined, detail }); return { ok: true, id } }
  if (d.action === 'create') {
    if (!(await db().query('SELECT 1 FROM fundraise.rooms WHERE id = $1', [d.room_id])).rowCount) throw apiError('not_found', 'That data room no longer exists.', 404)
    if (d.parent_id) { const par = await getF(d.parent_id); if (!par || par.room_id !== d.room_id || par.link_url) throw apiError('invalid', 'Choose a folder in this room.') }
    const r = await one<{ id: string }>('INSERT INTO fundraise.folders (room_id, parent_id, name, link_url, position) VALUES ($1, $2, $3, $4, $5) RETURNING id', [d.room_id, d.parent_id ?? null, d.name, d.link_url ?? null, await nextPos(d.room_id, d.parent_id ?? null)])
    return done(r.id, { name: d.name, link: !!d.link_url })
  }
  if (d.action === 'order') {
    await db().query('UPDATE fundraise.folders f SET position = o.i FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, i) WHERE f.id = o.id', [d.ids])
    return done(null, { count: d.ids.length })
  }
  const f = await getF(d.id)
  if (!f) throw apiError('not_found', 'That folder no longer exists.', 404)
  if (d.action === 'update') {
    if (d.link_url && !f.link_url) throw apiError('invalid', 'Only a link category has a link.')
    await db().query('UPDATE fundraise.folders SET name = coalesce($2, name), link_url = coalesce($3, link_url) WHERE id = $1', [f.id, d.name ?? null, d.link_url ?? null])
    if (d.name && !f.parent_id) { await db().query('UPDATE fundraise.rooms SET financing_folder = $3 WHERE id = $1 AND financing_folder = $2', [f.room_id, f.name, d.name]); await resync(await subtree(f.id)) }
    return done(f.id, { name: d.name ?? null })
  }
  if (d.action === 'move') {
    const room = d.room_id ?? f.room_id, parent = d.parent_id ?? null
    if (!(await db().query('SELECT 1 FROM fundraise.rooms WHERE id = $1', [room])).rowCount) throw apiError('not_found', 'That data room no longer exists.', 404)
    const tree = await subtree(f.id)
    if (parent) { const par = await getF(parent); if (!par || par.room_id !== room || par.link_url) throw apiError('invalid', 'Choose a folder in that room.'); if (tree.includes(parent)) throw apiError('invalid', "A folder can't go inside itself.") }
    if (room !== f.room_id) {
      const files = (await db().query<{ id: string }>('SELECT id FROM fundraise.files WHERE folder_id = ANY($1::uuid[])', [tree])).rows.map((r) => r.id)
      if (files.length) await db().query('UPDATE fundraise.links l SET file_ids = array(SELECT x FROM unnest(l.file_ids) x WHERE NOT x = ANY($1::uuid[])) WHERE l.file_ids && $1::uuid[] AND l.room_id IS DISTINCT FROM $2', [files, room])
      await db().query('UPDATE fundraise.folders SET room_id = $2 WHERE id = ANY($1::uuid[])', [tree, room])
    }
    await db().query('UPDATE fundraise.folders SET parent_id = $2, position = $3 WHERE id = $1', [f.id, parent, await nextPos(room, parent)])
    await resync(tree, room)
    return done(f.id, { room: room !== f.room_id, parent })
  }
  if (d.action === 'own') {
    const room = (await one<{ id: string }>('INSERT INTO fundraise.rooms (name, created_by) VALUES ($1, $2) RETURNING id', [f.name, user.userId])).id
    const tree = await subtree(f.id)
    const files = (await db().query<{ id: string }>('SELECT id FROM fundraise.files WHERE folder_id = ANY($1::uuid[])', [tree])).rows.map((r) => r.id)
    if (files.length) await db().query('UPDATE fundraise.links l SET file_ids = array(SELECT x FROM unnest(l.file_ids) x WHERE NOT x = ANY($1::uuid[])) WHERE l.file_ids && $1::uuid[] AND l.room_id IS DISTINCT FROM $2', [files, room])
    await db().query('UPDATE fundraise.folders SET room_id = $2 WHERE id = ANY($1::uuid[])', [tree, room])
    // Its sub-folders become the new room's categories; files at its own top level go under General.
    await db().query('UPDATE fundraise.folders SET parent_id = NULL WHERE parent_id = $1', [f.id])
    await db().query("UPDATE fundraise.files SET room_id = $2, folder_id = NULL, folder = 'General' WHERE folder_id = $1", [f.id, room])
    await db().query('DELETE FROM fundraise.folders WHERE id = $1', [f.id])
    await resync(tree.filter((x) => x !== f.id), room)
    return done(room, { name: f.name })
  }
  // delete
  const tree = await subtree(f.id)
  if ((await db().query('SELECT 1 FROM fundraise.files WHERE folder_id = ANY($1::uuid[]) LIMIT 1', [tree])).rowCount) throw apiError('not_empty', 'Move or delete the files in it first.')
  await db().query('DELETE FROM fundraise.folders WHERE id = $1', [f.id])
  return done(f.id, { name: f.name })
})
