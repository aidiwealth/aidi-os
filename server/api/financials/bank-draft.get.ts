// Monthly figures drafted from the bank for a company (cash basis), with which months are new, which were drafted from
// the bank before (and can be refreshed) and which already have the company's own figures (left alone).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'admin')
  const s = z.string().regex(/^entity:[0-9a-f-]{36}$/).safeParse(getQuery(event).subject)
  if (!s.success) return { currency: null, months: [], available: false }
  if (!(await enabledModules()).has('banking_treasury')) return { currency: null, months: [], available: false }
  const d = await bankDraft(s.data.slice(7))
  return { ...d, available: true }
})
