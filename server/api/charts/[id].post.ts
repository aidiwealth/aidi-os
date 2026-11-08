// Change a placed chart (what it shows), or freeze it at today's figures, or let it follow the figures again.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Chart not found.', 404)
  const b = await readBody(event)
  const cur = (await db().query<{ spec: unknown }>('SELECT spec FROM core.inline_charts WHERE id = $1', [id])).rows[0]
  if (!cur) throw apiError('not_found', 'Chart not found.', 404)
  const spec = b?.spec ? cleanSpec(b.spec) : cleanSpec(cur.spec)
  if (!spec) throw apiError('invalid', 'Choose what the chart shows.')
  if (b?.freeze === true) {
    const d = await chartDrawing(spec)
    await db().query('UPDATE core.inline_charts SET spec = $2, svg = $3, frozen_at = now(), updated_at = now() WHERE id = $1', [id, JSON.stringify({ ...spec, drawing: d }), drawingSvg(d)])
  } else await db().query('UPDATE core.inline_charts SET spec = $2, svg = NULL, frozen_at = NULL, updated_at = now() WHERE id = $1', [id, JSON.stringify(spec)])
  return { ok: true, url: brands()[hostBrand(event)].url + '/api/public/charts/' + id + '.svg?v=' + Date.now() }
})
