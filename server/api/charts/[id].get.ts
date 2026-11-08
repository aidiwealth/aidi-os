// A placed chart's settings, to change it from the editor.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Chart not found.', 404)
  const r = (await db().query<{ spec: Record<string, unknown>; frozen_at: string | null }>('SELECT spec, frozen_at FROM core.inline_charts WHERE id = $1', [id])).rows[0]
  if (!r) throw apiError('not_found', 'Chart not found.', 404)
  return { spec: cleanSpec(r.spec), frozen_at: r.frozen_at }
})
