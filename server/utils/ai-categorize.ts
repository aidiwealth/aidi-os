// AI categories for bank payments: for each vendor (and whether money goes in or out) still on the automatic guess,
// AI picks the category from the company's own list, once. The choice is kept as a rule (banking.ai_rules) and applied
// to every payment past and future from that vendor that the founder has not set: their own choices and "always"
// rules always win, and transfers between the company's own accounts are found first. Vendors AI is unsure about stay
// on the automatic guess (and are not asked about again).
import { z } from 'zod'
const BATCH = 60

export async function aiCategorize(maxVendors = 300): Promise<{ asked: number; set: number; updated: number }> {
  if (!useRuntimeConfig().anthropicApiKey) return { asked: 0, set: 0, updated: 0 }
  const accts = await listAccounts().catch(() => [])
  const cats = [...STD_CATS.map((c) => ({ key: c.key, label: c.label, dir: c.dir })),
    ...accts.map((a) => ({ key: 'cat:' + a.parent + ':' + a.name, label: a.name + ' (' + (STD_CATS.find((c) => c.key === a.parent)?.label ?? a.parent) + ')', dir: STD_CATS.find((c) => c.key === a.parent)?.dir ?? 'any' }))]
  const todo = (await db().query<{ vendor_key: string; direction: 'in' | 'out'; vendor: string; n: number; total: number; descs: string[] }>(
    `SELECT l.vendor_key, l.direction, max(l.vendor) AS vendor, count(*)::int AS n, round(sum(coalesce(l.amount_usd, l.amount)))::float AS total,
            (array_agg(DISTINCT left(l.description, 70)))[1:3] AS descs
       FROM banking.ledger l
      WHERE l.category_by = 'auto' AND coalesce(l.category, '') <> 'transfer'
        AND NOT EXISTS (SELECT 1 FROM banking.category_rules r WHERE r.organization_id = l.organization_id AND r.vendor_key = l.vendor_key)
        AND NOT EXISTS (SELECT 1 FROM banking.ai_rules a WHERE a.organization_id = l.organization_id AND a.vendor_key = l.vendor_key AND a.direction = l.direction)
      GROUP BY 1, 2 ORDER BY sum(coalesce(l.amount_usd, l.amount)) DESC LIMIT $1`, [maxVendors])).rows
  if (!todo.length) return { asked: 0, set: 0, updated: 0 }
  const org = await currentOrg(), own = (await custEntities().catch(() => [])).map((e) => e.name)
  const keys = cats.map((c) => c.key)
  const Out = z.object({ items: z.array(z.object({ i: z.number().int(), category: z.string(), confidence: z.number().min(0).max(1) })) })
  let set = 0
  for (let b = 0; b < todo.length; b += BATCH) {
    const part = todo.slice(b, b + BATCH)
    const lines = part.map((v, i) => i + '. ' + (v.direction === 'in' ? 'MONEY IN from ' : 'MONEY OUT to ') + v.vendor + ' · ' + v.n + ' payment' + (v.n === 1 ? '' : 's') + ' · e.g. ' + v.descs.join(' | ')).join('\n')
    const { output } = await runAiTool<z.infer<typeof Out>>({
      task: 'bank_categorize', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'bank-cat-v1', inputRef: 'treasury:' + (currentOrgId() ?? ''), maxTokens: 3000,
      system: 'You categorise a company\'s bank payments for its management accounts. The company is ' + (org?.name ?? 'a startup') + (own.length ? ' (its own companies: ' + own.join(', ') + ')' : '') + '. For each payee or payer, choose the one category that fits from the list, or "unsure" when the name and examples do not make it clear. Money in can only be a money-in category, money out only a money-out one; "transfer" is only for money between the company\'s own accounts or its own companies. Customer payments are revenue; suppliers the company resells or uses to deliver its product (for example telecom carriers and SMS routes for a messaging company, hosting for a software company) are cost of revenue. Give your confidence from 0 to 1.',
      user: 'Categories (key: label, direction):\n' + cats.map((c) => c.key + ': ' + c.label + ' (' + c.dir + ')').join('\n') + '\n\nPayees and payers:\n' + lines,
      toolName: 'categories', toolDescription: 'Record one category per numbered line.',
      jsonSchema: { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'category', 'confidence'], properties: { i: { type: 'integer' }, category: { type: 'string', enum: [...keys, 'unsure'] }, confidence: { type: 'number' } } } } } },
      schema: Out
    })
    for (const v of part) {
      const o = output.items.find((x) => x.i === part.indexOf(v)), c = cats.find((x) => x.key === o?.category)
      const fits = !!c && (c.dir === 'any' || c.dir === v.direction) && (o?.confidence ?? 0) >= 0.6
      await db().query('INSERT INTO banking.ai_rules (vendor_key, direction, category, confidence) VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id, vendor_key, direction) DO NOTHING',
        [v.vendor_key, v.direction, fits ? c!.key : null, o ? Math.round(o.confidence * 100) / 100 : null])
      if (fits) set++
    }
  }
  return { asked: todo.length, set, updated: await applyAiRules() }
}

// Every payment still on the automatic guess, from a vendor AI has a category for (transfers already found stay).
export async function applyAiRules(): Promise<number> {
  return (await db().query(`UPDATE banking.ledger l SET category = a.category, category_by = 'ai' FROM banking.ai_rules a
      WHERE a.organization_id = l.organization_id AND a.vendor_key = l.vendor_key AND a.direction = l.direction AND a.category IS NOT NULL AND l.category_by = 'auto' AND coalesce(l.category, '') <> 'transfer'
        AND NOT EXISTS (SELECT 1 FROM banking.category_rules r WHERE r.organization_id = l.organization_id AND r.vendor_key = l.vendor_key)`)).rowCount ?? 0
}
