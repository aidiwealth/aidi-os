// Suggest how to group customers for retention: size bands that suit this company's prices (Enterprise, Mid-market,
// SMB), or categories that fit its market (for example Banks / Fintechs / Merchants, Self-serve / Sales-led,
// Platform / API). AI when on; size bands from the spread of customer run-rates otherwise.
import { z } from 'zod'
import { arrOf, span } from '~/shared/customer-metrics'
const Out = z.object({ name: z.string(), why: z.string(), kind: z.enum(['size', 'custom']), enterprise_arr: z.number().nullable(), midmarket_arr: z.number().nullable(),
  segments: z.array(z.object({ name: z.string(), rule: z.string() })), assign: z.array(z.object({ customer: z.string(), segment: z.string() })), alternatives: z.array(z.string()) })
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const cfg = await customerConfig(), cs = await loadCustomers(), sp = span(cs)
  if (!sp || cs.length < 3) throw apiError('invalid', 'Upload customer revenue first.')
  const list = cs.map((c) => ({ c, arr: Math.round(Math.max(arrOf(c, sp.last), ...Object.keys(c.rev).map((m) => arrOf(c, m)))) })).sort((a, b) => b.arr - a.arr)
  const q = (p: number) => list[Math.min(list.length - 1, Math.floor(list.length * p))]!.arr
  const nice = (n: number) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, n)))); return Math.max(p, Math.round(n / p) * p) }
  let out: z.infer<typeof Out> = { name: 'Size by annual revenue', why: 'Bands set from your own customers: roughly the top tenth are Enterprise and the middle are Mid-market.', kind: 'size', enterprise_arr: nice(q(0.1)), midmarket_arr: nice(q(0.5)), segments: [], assign: [], alternatives: ['Group by sector if your customers span industries', 'Group by plan or product if you sell more than one'] }
  if (out.midmarket_arr! >= out.enterprise_arr!) out.midmarket_arr = Math.round(out.enterprise_arr! / 4)
  out.segments = [{ name: 'Enterprise', rule: 'Annual revenue from ' + cfg.currency + ' ' + out.enterprise_arr!.toLocaleString('en-US') }, { name: 'Mid-market', rule: cfg.currency + ' ' + out.midmarket_arr!.toLocaleString('en-US') + ' to ' + out.enterprise_arr!.toLocaleString('en-US') }, { name: 'SMB', rule: 'Below ' + cfg.currency + ' ' + out.midmarket_arr!.toLocaleString('en-US') }]
  let ai = false
  if (useRuntimeConfig().anthropicApiKey) {
    try {
      const org = await currentOrg()
      const lines = list.slice(0, 400).map(({ c, arr }) => [c.name, arr, c.sector ?? '', c.plan ?? '', c.country ?? '', c.segment ?? ''].join(' | '))
      const { output } = await runAiTool({ task: 'customer_segments', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'customer-segments-v1', inputRef: org?.id ?? 'org',
        system: 'You are a SaaS and fintech growth analyst (Silicon Valley practice, also African and emerging-market B2B companies). Suggest the most useful way for this company to group customers when it reports revenue retention (NRR, GRR, churn) to investors. ' +
          'Common choices: size bands by annual revenue (Enterprise, Mid-market, SMB, with thresholds that suit the company\'s prices, not US defaults), customer type (Banks, Fintechs, Merchants, Telcos, Government), go-to-market (Self-serve vs Sales-led), product or plan, region. ' +
          'Pick one. kind "size" uses enterprise_arr and midmarket_arr (in ' + cfg.currency + ') and leaves assign empty; kind "custom" names 2 to 6 segments with a rule each and assigns every customer listed. Give 2 or 3 alternatives in a short phrase each. Keep why to two sentences.',
        user: 'Company: ' + (org?.name ?? '') + '\nCurrency: ' + cfg.currency + '\nCustomers (name | annual revenue run-rate | sector | plan | country | segment given):\n' + lines.join('\n'),
        toolName: 'record_segments', toolDescription: 'Record the suggested grouping.', schema: Out, maxTokens: 6000,
        jsonSchema: { type: 'object', additionalProperties: false, required: ['name', 'why', 'kind', 'enterprise_arr', 'midmarket_arr', 'segments', 'assign', 'alternatives'], properties: {
          name: { type: 'string' }, why: { type: 'string' }, kind: { type: 'string', enum: ['size', 'custom'] }, enterprise_arr: { type: ['number', 'null'] }, midmarket_arr: { type: ['number', 'null'] },
          segments: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'rule'], properties: { name: { type: 'string' }, rule: { type: 'string' } } } },
          assign: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['customer', 'segment'], properties: { customer: { type: 'string' }, segment: { type: 'string' } } } },
          alternatives: { type: 'array', items: { type: 'string' } } } } })
      if (output.kind === 'size' && output.enterprise_arr && output.midmarket_arr && output.midmarket_arr < output.enterprise_arr) { out = { ...output, assign: [] }; ai = true }
      else if (output.kind === 'custom' && output.segments.length >= 2 && output.assign.length) { out = output; ai = true }
    } catch (e) { console.error('[customers] segments', (e as Error).message) }
  }
  const byName = new Map(cs.map((c) => [c.name.toLowerCase(), c.id]))
  const assign = out.assign.map((a) => ({ id: byName.get(a.customer.toLowerCase()) ?? null, name: a.customer, segment: a.segment.slice(0, 60) })).filter((a) => a.id)
  return { ...out, assign, ai }
})
