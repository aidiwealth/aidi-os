// VAT / sales tax by country for every invoice (service jobs, workspace subscriptions, wealth fees). Finvry console only.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  if (getMethod(event) === 'GET') { await requirePlatform(event); return { rates: await taxRates(true) } }
  const staff = await requirePlatform(event, true)
  const b = z.object({ rates: z.array(z.object({ country: z.string().regex(/^[A-Za-z]{2}$/), label: z.string().trim().min(1).max(30), rate: z.number().min(0).max(50), enabled: z.boolean(), applies_to: z.array(z.enum(['services', 'platform', 'wealth'])) })).max(50) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check each country code (2 letters), label and rate (0–50%).')
  await asPlatform(async () => {
    const keep = b.data.rates.map((r) => r.country.toUpperCase())
    await db().query('DELETE FROM core.tax_rates WHERE NOT (country = ANY($1::text[]))', [keep])
    for (const r of b.data.rates) await db().query('INSERT INTO core.tax_rates (country, label, rate, enabled, applies_to, updated_at) VALUES ($1,$2,$3,$4,$5, now()) ON CONFLICT (country) DO UPDATE SET label = $2, rate = $3, enabled = $4, applies_to = $5, updated_at = now()',
      [r.country.toUpperCase(), r.label, r.rate, r.enabled, r.applies_to])
  })
  forgetTaxRates()
  await platformAudit(event, staff.userId, 'tax_rates', null, { rates: b.data.rates })
  return { ok: true }
})
