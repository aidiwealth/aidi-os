// The financial review around the AI draft: checks for the adviser before the client relies on it, the adviser's edits
// (headline, summary, steps hidden or reworded), the client's ticks on steps, and the PDF report.
import { PLAIN_BUCKET, reportHeadline, reportRest, reportSteps, scoreWord } from '~/shared/wm-report'
import { assetLabel } from '~/shared/wm-assets'
import { noticeEntity } from '~/shared/wm-data-notice'

async function latest(clientId: string) {
  return (await db().query<{ id: string; content: Record<string, any>; created_at: string }>('SELECT id, content, created_at FROM wm.reports WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1', [clientId])).rows[0] ?? null
}
const perMonth = (rows: any[] | undefined, cur: string) => (rows ?? []).filter((r) => (r.currency ?? cur) === cur).reduce((a, r) => a + (Number(r.amount) || 0) / (r.frequency === 'annual' ? 12 : 1), 0)
const money = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: /^[A-Z]{3}$/.test(c) ? c : 'USD', maximumFractionDigits: 0 }).format(Math.round(v))

// What the adviser should look at before relying on the review: figures that don't match the details, tax that looks
// like one paycheque, documents the AI couldn't read, details changed since, steps that suggest unwanted assets.
export async function reportChecks(clientId: string) {
  const r = await latest(clientId); if (!r) return []
  const c = r.content, cur = /^[A-Z]{3}$/.test(c.currency) ? c.currency : 'USD'
  const prof = (await db().query<{ data: Record<string, any>; updated_at: string }>('SELECT data, updated_at FROM wm.profiles WHERE client_id = $1', [clientId])).rows[0]
  const p = prof?.data ?? {}, out: { level: 'warn' | 'info'; title: string; detail: string; fix?: string }[] = []
  const inc = perMonth(p.incomes, cur), rInc = Number(c.cash_flow?.monthly_income ?? 0)
  if (inc > 0 && rInc > 0 && Math.abs(rInc - inc) / inc > 0.15) out.push({ level: 'warn', title: 'Income doesn\'t match the details', detail: 'The review uses ' + money(rInc, cur) + ' a month; the details say ' + money(inc, cur) + '. ' + (rInc > inc ? 'It may have counted share pay or a one-off as monthly income.' : 'Something may be missing from the review.'), fix: 'regenerate' })
  const tax = perMonth(p.taxes, cur)
  if (inc * 12 > 60000 && tax > 0 && tax < inc * 0.06) out.push({ level: 'warn', title: 'Tax looks like one paycheque', detail: 'Tax in the details is ' + money(tax, cur) + ' a month on ' + money(inc, cur) + ' of income. Check whether the figures are per paycheque rather than per year.', fix: 'details' })
  const docs = (await db().query<{ name: string | null; mime_type: string }>('SELECT p.name, d.mime_type FROM wm.profile_docs p JOIN core.documents d ON d.id = p.document_id WHERE p.client_id = $1', [clientId])).rows
  const pics = docs.filter((d) => d.mime_type.startsWith('image/'))
  if (pics.length) out.push({ level: 'info', title: pics.length + ' document' + (pics.length === 1 ? '' : 's') + ' not read', detail: pics.map((d) => d.name || 'document').join(', ') + (pics.length === 1 ? ' is a photo or scan' : ' are photos or scans') + '; look at ' + (pics.length === 1 ? 'it' : 'them') + ' yourself.' })
  if (prof?.updated_at && Date.parse(prof.updated_at) > Date.parse(r.created_at) + 60000) out.push({ level: 'info', title: 'Details changed since this review', detail: 'Update the review so it uses the latest figures.', fix: 'regenerate' })
  if (!(p.goals ?? []).length) out.push({ level: 'info', title: 'No goals yet', detail: 'Steps are more useful with at least one goal and a date.' })
  const off = [...(await assetsOff(clientId))]
  const words: Record<string, RegExp> = { crypto: /crypto|bitcoin|ethereum/i, metals: /gold|silver|precious metal/i, real_estate: /property|real estate|reit/i, private: /pre-ipo|private (company|deal)|secondar/i, tbills: /treasury|t-bill|fixed deposit/i, stocks: /\b(etf|index fund|stocks?)\b/i, savings: /savings plan/i }
  for (const k of off) { const hit = reportSteps(c).filter((s) => words[k]?.test(s.title + ' ' + s.detail)); if (hit.length) out.push({ level: 'warn', title: assetLabel(k) + ' is switched off for this client', detail: 'Mentioned in: ' + hit.map((s) => s.title).join('; ') + '. Hide or reword the step.' }) }
  return out
}

export async function reportEdit(clientId: string, e: { headline?: string; summary?: string; hide?: string; show?: string; step?: { title: string; new_title?: string; detail?: string; timeframe?: string } }) {
  const r = await latest(clientId); if (!r) throw apiError('not_found', 'There is no review yet.', 404)
  const c = r.content
  if (e.headline != null) c.headline = e.headline.trim().slice(0, 200) || undefined
  if (e.summary != null) c.summary = e.summary.trim().slice(0, 2000)
  const hidden = new Set<string>(c.hidden_steps ?? [])
  if (e.hide) hidden.add(e.hide); if (e.show) hidden.delete(e.show)
  c.hidden_steps = [...hidden]
  if (e.step) { const a = (c.actions ?? []).find((x: { title: string }) => x.title === e.step!.title); if (!a) throw apiError('not_found', 'Step not found.', 404)
    if (e.step.new_title) { const t = e.step.new_title.trim().slice(0, 160); c.hidden_steps = c.hidden_steps.map((h: string) => (h === a.title ? t : h)); c.steps_done = (c.steps_done ?? []).map((h: string) => (h === a.title ? t : h)); a.title = t }
    if (e.step.detail != null) a.detail = e.step.detail.trim().slice(0, 1000)
    if (e.step.timeframe != null) a.timeframe = e.step.timeframe.trim().slice(0, 60) }
  c.edited_at = new Date().toISOString()
  await db().query('UPDATE wm.reports SET content = $2 WHERE id = $1', [r.id, JSON.stringify(c)])
}

export async function reportStepDone(clientId: string, title: string, done: boolean) {
  const r = await latest(clientId); if (!r) throw apiError('not_found', 'There is no review yet.', 404)
  const s = new Set<string>(r.content.steps_done ?? []); if (done) s.add(title); else s.delete(title)
  r.content.steps_done = [...s]
  await db().query('UPDATE wm.reports SET content = $2 WHERE id = $1', [r.id, JSON.stringify(r.content)])
}

// The PDF: a wealth-manager style report in Garamond (cover with details, summary and next steps, where you stand,
// money in and out, every step, the suggested mix, growth by year, strengths and risks, assumptions).
export async function wmReportPdf(clientId: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const r = await latest(clientId); if (!r) throw apiError('not_found', 'There is no review yet.', 404)
  const x = await docContext(clientId), c = r.content, cur = /^[A-Z]{3}$/.test(c.currency) ? c.currency : 'USD', m = (v: number) => money(v, cur)
  const usd = (v: number) => money(v, 'USD')
  const when = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const who = x.c.contact_name || x.c.name, steps = reportSteps(c), cf = c.cash_flow ?? {}, bs = c.balance_sheet ?? {}
  const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')
  const series = (c.series ?? []) as { year: number; plan: number; as_is: number }[]
  const md: string[] = [
    '## 1. Summary', reportHeadline(c), '', reportRest(c), '',
    '| Key figure | Amount |', '|---|---|',
    '| Net worth (what you own minus what you owe) | ' + m(Number(bs.net_worth ?? 0)) + ' |',
    '| Left over each month | ' + m(Number(cf.monthly_surplus ?? 0)) + ' |',
    '| Share of income you keep | ' + Math.round(Number(cf.savings_rate_pct ?? 0)) + '% |',
    '| Financial health score | ' + Math.round(Number(c.health_score ?? 0)) + ' of 100 (' + scoreWord(Number(c.health_score ?? 0)) + ') |', '',
    '### Your next steps', '| Step | Why it matters | When |', '|---|---|---|',
    ...steps.slice(0, 3).map((s) => '| ' + esc(s.title) + ' | ' + esc(s.detail) + ' | ' + esc(s.timeframe) + ' |'), '',
    '## 2. Where you stand today', '| What you own | Value |', '|---|---|',
    ...(bs.assets ?? []).map((a: any) => '| ' + esc(a.label) + ' | ' + m(Number(a.value)) + ' |'), '',
    '| What you owe | Amount |', '|---|---|',
    ...((bs.liabilities ?? []).length ? bs.liabilities.map((a: any) => '| ' + esc(a.label) + ' | ' + m(Number(a.value)) + ' |') : ['| Nothing | - |']), '',
    '**Net worth: ' + m(Number(bs.net_worth ?? 0)) + '**', '',
    '## 3. Money in and out', '| Each month | Amount |', '|---|---|',
    '| Money coming in | ' + m(Number(cf.monthly_income ?? 0)) + ' |', '| Spending and tax | ' + m(Number(cf.monthly_spending ?? 0)) + ' |', '| Left over | ' + m(Number(cf.monthly_surplus ?? 0)) + ' |', '',
    '| Over a year | Amount |', '|---|---|',
    ...(c.income_statement?.lines ?? []).map((l: any) => '| ' + esc(l.label) + ' | ' + m(Number(l.annual)) + ' |'), '| **What is left** | **' + m(Number(c.income_statement?.net ?? 0)) + '** |', '',
    '## 4. Your plan, step by step', '| # | Step | When | Priority |', '|---|---|---|---|',
    ...steps.map((s, i) => '| ' + (i + 1) + ' | ' + esc(s.title) + ': ' + esc(s.detail) + ' | ' + esc(s.timeframe) + ' | ' + (s.priority === 'high' ? 'Now' : s.priority === 'medium' ? 'Soon' : 'Later') + ' |'), '',
  ]
  if (c.fortress?.rows?.length) md.push('## 5. How we suggest spreading your money', 'Today and what we suggest, on about ' + usd(Number(c.fortress.base ?? 0)) + ' you could invest. Spreading money across different kinds of investment means one bad year for one of them can\'t undo your progress.', '',
    '| Kind of investment | Today | Suggested | To move |', '|---|---|---|---|',
    ...c.fortress.rows.map((f: any) => '| ' + (PLAIN_BUCKET[f.key] ?? esc(f.label)) + ' | ' + f.current_pct + '% | ' + f.target_pct + '% | ' + (f.gap === 0 ? '-' : (f.gap > 0 ? 'add ' : 'reduce by ') + usd(Math.abs(f.gap))) + ' |'), '')
  if (series.length) md.push('## 6. What your savings could be worth', 'If you invest ' + m(Number(c.projection?.monthly_contribution ?? 0)) + ' a month and it grows ' + (c.projection?.annual_return_pct ?? '') + '% a year after costs, compared with leaving things as they are. Real returns go up and down; this is a guide, not a promise.', '',
    '| Year | Following the plan | If nothing changes |', '|---|---|---|', ...series.map((s) => '| ' + s.year + ' | ' + m(s.plan) + ' | ' + m(s.as_is) + ' |'), '')
  md.push('## 7. Going well', ...(c.strengths ?? []).map((s: string) => '- ' + s), '', '## 8. Watch out for', ...(c.risks ?? []).map((s: string) => '- ' + s), '',
    '## 9. Assumptions and important information',
    '- Prepared on ' + when + ' from the information you gave us and the documents you shared. The figures have not been audited.',
    '- Growth figures assume a steady return after costs. Investments can fall as well as rise, and you may get back less than you put in.',
    '- This report is general financial guidance. It is not a recommendation to buy or sell any security, and it is not tax or legal advice. Talk to your adviser before acting.',
    '- ' + noticeEntity(x.entity, x.c.country === 'NG' ? 'NG' : 'US') + ', part of The Aidi Group.')
  const cover = ['Prepared by Aidi Wealth for ' + who + '. Private and confidential.', '', '### Contents', '1. Summary', '2. Where you stand today', '3. Money in and out', '4. Your plan, step by step', ...(c.fortress?.rows?.length ? ['5. How we suggest spreading your money'] : []), ...(series.length ? ['6. What your savings could be worth'] : []), '7. Going well', '8. Watch out for', '9. Assumptions and important information']
  const bytes = await legalPdf(noticeEntity(x.entity, x.c.country === 'NG' ? 'NG' : 'US'), [{ title: 'Financial plan', md: cover.join('\n'), header: { eyebrow: 'Aidi Wealth · Private and confidential', fields: [{ label: 'Prepared for', value: who }, { label: 'Date', value: when }, { label: 'Risk level', value: x.c.risk_profile ? x.c.risk_profile.replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase()) : 'Not set yet' }, { label: 'Main currency', value: cur }] } }, { title: 'Financial plan', md: md.join('\n') }], { logo: 'aidi', font: 'garamond' })
  return { bytes, filename: 'Aidi Wealth financial plan - ' + who.replace(/[^A-Za-z0-9 .-]/g, '') + '.pdf' }
}
