// Sign-up: check a partner code before the account is created (the discount it gives, never other codes).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  await rateLimit('partner_check', clientIp(event), 30, 60 * 60 * 1000)
  const b = z.object({ code: z.string().max(40) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('bad_code', 'Enter your partner code.')
  const p = await partnerForCode(b.data.code)
  return { partner: p.name, pct: p.discount_pct, months: p.months }
})
