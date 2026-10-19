// Read an uploaded customer revenue file (Excel, CSV, a Word table or a PDF read by AI) and check it for duplicates
// before anything is saved.
import { randomUUID } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  requireCustEntity()
  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
  if (file.data.length > 15 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 15 MB.', 413)
  await rateLimit('customer_preview', user.userId, 40, 60 * 60 * 1000)
  const name = file.filename ?? 'file'
  const { grids, note } = await gridsFromFile(Buffer.from(file.data), name, randomUUID())
  return await previewCustomers(grids, name, user.userId, note)
})
