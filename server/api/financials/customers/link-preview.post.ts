// Read a linked sheet (Google Sheets, Excel online, Dropbox) for the first time and check it for duplicates; saving
// it (import with link) keeps the link and re-reads it every day.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  requireCustEntity()
  const b = z.object({ url: z.string().trim().min(10).max(600) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Paste the share link to the sheet.')
  await rateLimit('customer_preview', user.userId, 40, 60 * 60 * 1000)
  const f = await fetchLinkedSheet(b.data.url)
  const r = await previewCustomers(await readGrids(f.buf, f.ext, { tabs: 40, rows: 60000, cols: 240 }), f.provider + ' link', user.userId)
  return { ...r, provider: f.provider }
})
