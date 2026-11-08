// Place a chart in text: saved with what it shows, and linked from the text by a random address. Frozen charts keep
// the picture from this moment; the others are worked out again each time they are shown.
export default defineEventHandler(async (event) => {
  const u = await requireUser(event)
  const b = await readBody(event)
  const spec = cleanSpec(b?.spec)
  if (!spec) throw apiError('invalid', 'Choose what the chart shows.')
  const d = await chartDrawing(spec)
  const frozen = b?.freeze === true
  const r = await db().query<{ id: string }>('INSERT INTO core.inline_charts (spec, svg, frozen_at, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [JSON.stringify(frozen ? { ...spec, drawing: d } : spec), frozen ? drawingSvg(d) : null, frozen ? new Date().toISOString() : null, u.userId])
  const id = r.rows[0]!.id
  return { id, url: brands()[hostBrand(event)].url + '/api/public/charts/' + id + '.svg', alt: d.alt, title: d.alt.split(/[.:]/)[0] }
})
