// The financial review around the AI draft: checks for the adviser before the client relies on it, the adviser's edits
// (headline, summary, steps hidden or reworded), the client's ticks on steps, and the PDF report.
import { reportSteps } from '~/shared/wm-report'
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
  for (const k of off) { const hit = reportSteps(c, true).filter((s) => OFF_WORDS[k]?.test(s.title + ' ' + s.detail)); if (hit.length) out.push({ level: 'info', title: assetLabel(k) + ' is switched off for this client', detail: 'Hidden from the client automatically: ' + hit.map((s) => s.title).join('; ') + '. Update the review to redo the plan without it.', fix: 'regenerate' }) }
  return out
}

// The review as shown: the suggested mix worked out again from today's holdings and the asset types the client wants
// (so a type switched off later disappears and the rest is spread again), and steps, strengths and risks about
// switched-off types left out for the client (staff still see those steps, marked hidden).
const OFF_WORDS: Record<string, RegExp> = { crypto: /crypto|bitcoin|ethereum/i, metals: /gold|silver|precious metal/i, real_estate: /property|real estate|reit/i, private: /pre-ipo|private (company|deal)|secondar/i, tbills: /treasury|t-bill|fixed deposit/i, stocks: /\b(etf|index fund)s?\b/i, savings: /savings plan/i }
export async function liveContent(clientId: string, content: Record<string, any>): Promise<Record<string, any>> {
  const c = { ...content }, off = [...(await assetsOff(clientId))]
  const f = await fortressView(clientId).catch(() => null)
  if (f) c.fortress = f
  if (off.length) {
    const hit = (t: string) => off.some((k) => OFF_WORDS[k]?.test(t))
    c.hidden_steps = [...new Set([...(c.hidden_steps ?? []), ...(c.actions ?? []).filter((a: { title: string; detail: string }) => hit(a.title + ' ' + a.detail)).map((a: { title: string }) => a.title)])]
    c.strengths = (c.strengths ?? []).filter((x: string) => !hit(x)); c.risks = (c.risks ?? []).filter((x: string) => !hit(x))
  }
  return c
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

// The PDF, in the Aidi Wealth statement design (see wm-report-pdf.ts).
export async function wmReportPdf(clientId: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const r = await latest(clientId); if (!r) throw apiError('not_found', 'There is no review yet.', 404)
  const x = await docContext(clientId), country = x.c.country === 'NG' ? 'NG' : 'US'
  const who = x.c.contact_name || x.c.name
  const bytes = await planPdf({ content: await liveContent(clientId, r.content), prepared: r.created_at, client: who, entity: noticeEntity(x.entity, country), address: x.c.entity_address, country, risk: x.c.risk_profile })
  return { bytes, filename: 'Aidi Wealth financial plan - ' + who.replace(/[^A-Za-z0-9 .-]/g, '') + '.pdf' }
}
