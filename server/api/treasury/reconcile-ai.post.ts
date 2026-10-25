// Find the difference with AI: for a month where the bank and Financials disagree, AI reads the bank lines against
// Financials and the month's payments, and suggests payments that look to be in the wrong category (each one the
// founder can apply), plus other likely causes (an account missing, timing, a figure keyed wrongly). It never changes
// anything itself. Runs in the background; the page follows it.
import { z } from 'zod'
interface Sug { id: string; category: string; reason: string }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a month.')
  await rateLimit('reconcile_ai', user.userId, 30, 60 * 60 * 1000)
  const sc = await forecastScope(event), month = b.data.month
  const job = await startAiJob(event, 'reconcile', user.userId, async (set) => {
    await set('reading')
    const rv = await reconView(sc, 24), row = rv.rows.find((r) => r.month === month)
    if (!row) return { summary: 'No bank figures for this month yet.', suggestions: [], causes: [] }
    const main = await companyEntityId(), rate = await rateTo(sc.currency)
    const tx = (await db().query<{ id: string; d: string; vendor: string; description: string; direction: 'in' | 'out'; amount: number; currency: string; category: string | null; account: string | null }>(
      `SELECT id, txn_date::text AS d, vendor, left(description, 90) AS description, direction, amount::float, currency, category, account_label AS account FROM banking.ledger
        WHERE to_char(txn_date, 'YYYY-MM') = $1 AND ($2::uuid IS NULL OR coalesce(entity_id, $3::uuid) = $2) ORDER BY amount_usd DESC NULLS LAST, amount DESC LIMIT 220`, [month, sc.group ? null : sc.entity, main])).rows
    const cats = [...STD_CATS.map((c) => ({ key: c.key, label: c.label, dir: c.dir })), ...(await listAccounts().catch(() => [])).map((a) => ({ key: 'cat:' + a.parent + ':' + a.name, label: a.name, dir: STD_CATS.find((c) => c.key === a.parent)?.dir ?? 'any' }))]
    const r0 = (v: number | null) => (v === null ? 'none' : Math.round(v).toLocaleString('en-US'))
    const lines = ['Cash at month end: bank ' + r0(row.cash.bank) + ', Financials ' + r0(row.cash.fin) + ' (' + row.cash.accounts + ' of ' + row.cash.of + ' accounts have a balance)',
      'Customer receipts: bank ' + r0(row.receipts.bank) + ', Financials revenue ' + r0(row.receipts.fin),
      ...row.spend.map((x) => x.label + ': bank ' + r0(x.bank) + ', Financials ' + r0(x.fin)),
      'Not in the P&L: funding received ' + r0(row.other.financing) + ', other money in ' + r0(row.other.other_in) + ', transfers and investment moves ' + r0(row.other.transfers)]
    const list: string[] = []
    for (const [i, t] of tx.entries()) list.push(i + '. ' + t.d + ' ' + (t.direction === 'in' ? 'IN ' : 'OUT ') + Math.round(t.amount * await rate(t.currency)).toLocaleString('en-US') + ' ' + sc.currency + ' · ' + t.vendor + ' · ' + t.description + ' · now: ' + (t.category ?? 'none') + (t.account ? ' · ' + t.account : ''))
    await set('thinking')
    const Out = z.object({ summary: z.string().max(800), suggestions: z.array(z.object({ i: z.number().int(), category: z.string(), reason: z.string().max(200) })).max(25), causes: z.array(z.string().max(240)).max(5) })
    const { output } = await runAiTool<z.infer<typeof Out>>({
      task: 'bank_reconcile', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'bank-recon-v1', inputRef: 'treasury:' + (currentOrgId() ?? ''), maxTokens: 2500,
      system: 'You help a startup founder reconcile one month of their bank with their management accounts (Financials). Compare each bank line with the Financials line. Find payments that look to be in the wrong category and would close a difference (for example a transfer between own accounts counted as revenue, a supplier the company resells put under operating costs instead of cost of revenue, a loan or investment counted as income). Only suggest a change when the payment\'s description supports it. Money in can only take a money-in category, money out a money-out one. Also list other likely causes that recategorising cannot fix (an account missing, money in transit at month end, a statement not uploaded, timing between invoices and payments, a figure keyed wrongly). Be brief and plain; amounts in ' + sc.currency + '.',
      user: 'Month: ' + month + '\nBank against Financials:\n' + lines.join('\n') + '\n\nCategories (key: label, direction):\n' + cats.map((c) => c.key + ': ' + c.label + ' (' + c.dir + ')').join('\n') + '\n\nThe month\'s payments, largest first:\n' + list.join('\n'),
      toolName: 'reconciliation', toolDescription: 'Record the summary, suggested category changes (by payment number) and other causes.',
      jsonSchema: { type: 'object', additionalProperties: false, required: ['summary', 'suggestions', 'causes'], properties: {
        summary: { type: 'string', description: 'Two or three sentences: where the differences are and what explains them' },
        suggestions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'category', 'reason'], properties: { i: { type: 'integer' }, category: { type: 'string', enum: cats.map((c) => c.key) }, reason: { type: 'string' } } } },
        causes: { type: 'array', items: { type: 'string' } } } },
      schema: Out
    })
    // Only real payments, real categories, the right direction, and an actual change.
    const sugs: (Sug & { date: string; vendor: string; amount: number; currency: string; direction: string; from: string | null; label: string })[] = []
    for (const s of output.suggestions) {
      const t = tx[s.i], c = cats.find((x) => x.key === s.category)
      if (!t || !c || c.key === t.category || !(c.dir === 'any' || c.dir === t.direction) || sugs.some((x) => x.id === t.id)) continue
      sugs.push({ id: t.id, category: c.key, label: c.label, reason: s.reason, date: t.d, vendor: t.vendor, amount: t.amount, currency: t.currency, direction: t.direction, from: t.category })
    }
    return { summary: output.summary, suggestions: sugs, causes: output.causes }
  }, (e) => aiJobError(e, ['Compare the lines yourself below, or try again in a minute.']))
  await audit({ event, actorUserId: user.userId, action: 'treasury.reconcile_ai', objectType: 'bank_month', detail: { month } })
  return { job }
})
