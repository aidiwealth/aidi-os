// Check a proposed business name for a US state.
import { z } from 'zod'
import { US_STATES } from '~/shared/countries'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('name_check', u.clientId, 60, 60 * 60 * 1000)
  const b = z.object({ name: z.string().trim().min(2).max(120), state: z.string().refine((s) => US_STATES.includes(s), 'Choose a US state'), type: z.enum(['llc', 'corp']) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter a name, a US state and the company type.')
  const own = (await asPlatform(() => db().query<{ name: string }>("SELECT name FROM services.companies WHERE lower(jurisdiction) = lower($1) AND status <> 'dissolved'", [b.data.state]))).rows.map((r) => r.name).filter((m) => core(m) === core(b.data.name) || core(m).startsWith(core(b.data.name)))
  return await checkName(b.data.name, b.data.state, b.data.type, own)
})
