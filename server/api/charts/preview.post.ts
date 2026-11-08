// A chart for text, drawn from the workspace's figures, before it is placed (the chart picker's preview).
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const spec = cleanSpec((await readBody(event))?.spec)
  if (!spec) throw apiError('invalid', 'Choose what the chart shows.')
  const d = await chartDrawing(spec)
  return { svg: drawingSvg(d), alt: d.alt, labels: d.labels }
})
