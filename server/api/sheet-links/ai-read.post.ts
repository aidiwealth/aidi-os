// Read a complex workbook with AI: returns the map (where each figure is), what it would bring in, the other
// information found (and where it belongs) and suggested figures to add. Nothing is saved.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await requireModule(event, 'financials')
  rateLimit('sheet_ai', user.userId, 20, 60 * 60 * 1000)
  const b = z.object({ url: z.string().trim().min(10).max(600), subject: z.string().max(80), currency: z.string().regex(/^[A-Z]{3}$/).default('USD') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Paste the share link to the workbook.')
  if (!b.data.subject || b.data.subject === 'group') throw apiError('invalid', 'Choose the company or entity.')
  const { buf, ext, provider } = await fetchLinkedSheet(b.data.url)
  const grids = await readGrids(buf, ext, AI_GRID)
  if (!grids.some((g) => g.rows.some((r) => r.some((c) => c !== null)))) throw apiError('empty', 'That workbook looks empty.', 422)
  let map
  try { map = await mapWorkbook(grids, b.data.currency, 'sheet:' + b.data.url.slice(0, 90)) }
  catch (err) { if ((err as { statusCode?: number }).statusCode) throw err; console.error('[sheets] ai map', (err as Error).message); throw apiError('ai_failed', 'Could not read that workbook just now. Try again in a minute.', 502) }
  const r = readWithMap(grids, map)
  return { provider, tabs: grids.map((g) => g.name), map, preview: previewOf(r) }
})
