// Turning an update (cover + blocks) into HTML for email and the web. All user text is escaped first; charts are drawn
// with plain HTML (bars and tables) so they show in every email client.
const esc = (s: string): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function mdToHtml(src: string): string {
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
  const out: string[] = []; let list = false
  for (const raw of String(src ?? '').split(/\r?\n/)) {
    const l = raw.trim()
    if (/^[-*] /.test(l)) { if (!list) { out.push('<ul style="margin:0 0 14px;padding-left:22px">'); list = true } out.push('<li style="margin:0 0 6px">' + inline(l.slice(2)) + '</li>'); continue }
    if (list) { out.push('</ul>'); list = false }
    if (!l) continue
    const h = l.match(/^(#{1,3}) (.*)$/)
    out.push(h ? '<h3 style="font-family:Georgia,serif;font-weight:500;font-size:' + (h[1]!.length === 1 ? 26 : 21) + 'px;color:#0c1a2e;margin:22px 0 8px">' + inline(h[2]!) + '</h3>' : '<p style="margin:0 0 14px">' + inline(l) + '</p>')
  }
  if (list) out.push('</ul>')
  return out.join('')
}
export interface Block { type: string; md?: string; title?: string; metrics?: string[]; period?: string; count?: number; left?: Block; right?: Block; media_id?: string; caption?: string; url?: string; name?: string; file_id?: string }
type Series = { labels: string[]; series: { key: string; label: string; values: (number | null)[] }[]; currency: string }
const FLOWS = new Set(['revenue', 'cogs', 'gross_profit', 'opex_total', 'ebitda', 'net_income', 'operating_cf', 'burn'])
const COLORS = ['#1c3d63', '#5b8fd1', '#2f9a5f', '#d99a1e', '#7b5fd8', '#d04444']
// Metric series from the company's statements: monthly, quarterly or yearly (flows summed, balances at period end).
export async function metricSeries(metrics: string[], period: string, count: number): Promise<Series> {
  const org = (await currentOrg())!
  const ent = await companyEntityId()
  const cur = (org.settings.currency as string) || 'USD'
  const rows = ent ? await loadStatements('entity:' + ent, 'month', cur) : []
  const groups = new Map<string, { label: string; rows: typeof rows }>()
  for (const r of rows) {
    const d = new Date(r.period_end + 'T00:00:00Z'); const y = d.getUTCFullYear(), m = d.getUTCMonth()
    const key = period === 'year' ? String(y) : period === 'quarter' ? y + '-Q' + (Math.floor(m / 3) + 1) : r.period_end.slice(0, 7)
    const label = period === 'year' ? String(y) : period === 'quarter' ? 'Q' + (Math.floor(m / 3) + 1) + ' ' + y : d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    const g = groups.get(key) ?? { label, rows: [] }; g.rows.push(r); groups.set(key, g)
  }
  const keys = [...groups.keys()].sort().slice(-Math.max(1, Math.min(count || 12, 36)))
  const series = metrics.filter((k) => k in METRIC_LABEL).map((k) => ({ key: k, label: METRIC_LABEL[k] ?? k, values: keys.map((gk) => {
    const g = groups.get(gk)!; const ds = g.rows.map((r) => derive(r.lines, 'month'))
    if (FLOWS.has(k)) { const v = ds.map((x) => x[k]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) : null }
    if (k === 'gross_margin') { const rev = ds.reduce((a, x) => a + (x.revenue ?? 0), 0), gp = ds.reduce((a, x) => a + (x.gross_profit ?? 0), 0); return rev ? Math.round((gp / rev) * 1000) / 10 : null }
    return ds[ds.length - 1]?.[k] ?? null
  }) }))
  return { labels: keys.map((k) => groups.get(k)!.label), series, currency: rows[rows.length - 1]?.currency ?? cur }
}
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
function fmt(k: string, v: number | null, cur: string, short = false): string {
  if (v == null) return '—'
  if (k === 'gross_margin') return v + '%'
  if (k === 'runway') return v + ' mo'
  const a = Math.abs(v), s = SYM[cur] ?? cur + ' '
  const n = short ? (a >= 1e9 ? (a / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(0) + 'K' : String(Math.round(a))) : Math.round(a).toLocaleString('en-US')
  return (v < 0 ? '-' : '') + s + n
}
function chartHtml(b: Block, d: Series): string {
  if (!d.labels.length || !d.series.length) return '<div style="padding:18px;background:#f4f3ef;color:#8a8a8a;font-size:13px">No figures yet for this chart. Add them in Financials.</div>'
  const max = Math.max(1, ...d.series.flatMap((s) => s.values.map((v) => Math.abs(v ?? 0))))
  const rows = d.labels.map((lab, i) => '<tr><td style="padding:6px 10px 6px 0;font-size:12px;color:#6b6b6b;white-space:nowrap;vertical-align:middle;width:1%">' + esc(lab) + '</td><td style="padding:4px 0;width:99%">' +
    d.series.map((s, si) => { const v = s.values[i] ?? null; const w = v == null ? 0 : Math.max(1, Math.round((Math.abs(v) / max) * 82)); return '<div style="white-space:nowrap;margin:2px 0;line-height:16px"><span style="display:inline-block;height:14px;width:' + w + '%;background:' + (v != null && v < 0 ? '#d04444' : COLORS[si % COLORS.length]) + ';vertical-align:middle"></span><span style="font-size:11.5px;color:#3a3a3a;margin-left:6px;vertical-align:middle">' + esc(fmt(s.key, v, d.currency, true)) + '</span></div>' }).join('') + '</td></tr>').join('')
  const legend = d.series.map((s, si) => '<span style="display:inline-block;margin-right:14px;font-size:12px;color:#3a3a3a"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + COLORS[si % COLORS.length] + ';margin-right:5px"></span>' + esc(s.label) + '</span>').join('')
  return '<div style="border:1px solid #e6e4dd;padding:16px 18px;margin:0 0 18px">' + (b.title ? '<div style="font-weight:600;font-size:15px;color:#0c1a2e;margin:0 0 10px">' + esc(b.title) + '</div>' : '') + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table><div style="margin-top:10px;text-align:right">' + legend + '</div></div>'
}
function tableHtml(b: Block, d: Series): string {
  if (!d.labels.length || !d.series.length) return chartHtml(b, d)
  const th = (s: string, left = false) => '<th style="text-align:' + (left ? 'left' : 'right') + ';font-weight:500;font-size:12px;color:#6b6b6b;padding:7px 8px;border-bottom:1px solid #e6e4dd">' + esc(s) + '</th>'
  return '<div style="border:1px solid #e6e4dd;padding:14px 16px;margin:0 0 18px;overflow-x:auto">' + (b.title ? '<div style="font-weight:600;font-size:15px;color:#0c1a2e;margin:0 0 8px">' + esc(b.title) + '</div>' : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' + th('Metric', true) + d.labels.map((l) => th(l)).join('') + '</tr>' +
    d.series.map((s) => '<tr><td style="font-size:13px;padding:7px 8px;border-bottom:1px solid #f0efea">' + esc(s.label) + '</td>' + s.values.map((v) => '<td style="text-align:right;font-size:13px;padding:7px 8px;border-bottom:1px solid #f0efea">' + esc(fmt(s.key, v, d.currency, true)) + '</td>').join('') + '</tr>').join('') + '</table></div>'
}
export async function renderBlocks(blocks: Block[], base: string): Promise<string> {
  const out: string[] = []
  for (const b of blocks.slice(0, 80)) {
    if (b.type === 'text') out.push(mdToHtml(b.md ?? ''))
    else if (b.type === 'chart') out.push(chartHtml(b, await metricSeries(b.metrics ?? [], b.period ?? 'month', b.count ?? 12)))
    else if (b.type === 'metrics_table') out.push(tableHtml(b, await metricSeries(b.metrics ?? [], b.period ?? 'month', b.count ?? 6)))
    else if (b.type === 'two_charts') { const l = b.left ?? { type: 'chart' }, r = b.right ?? { type: 'chart' }
      out.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" style="vertical-align:top;padding-right:6px">' + chartHtml(l, await metricSeries(l.metrics ?? [], l.period ?? 'month', l.count ?? 6)) + '</td><td width="50%" style="vertical-align:top;padding-left:6px">' + chartHtml(r, await metricSeries(r.metrics ?? [], r.period ?? 'month', r.count ?? 6)) + '</td></tr></table>') }
    else if (b.type === 'image' && b.media_id && /^[0-9a-f-]{36}$/.test(b.media_id)) out.push('<div style="margin:0 0 18px"><img src="' + base + '/api/public/media/' + b.media_id + '" alt="' + esc(b.caption ?? '') + '" style="max-width:100%;display:block">' + (b.caption ? '<div style="font-size:12.5px;color:#6b6b6b;margin-top:6px">' + esc(b.caption) + '</div>' : '') + '</div>')
    else if (b.type === 'file' && b.media_id && /^[0-9a-f-]{36}$/.test(b.media_id)) out.push('<div style="margin:0 0 18px;border:1px solid #e6e4dd;padding:12px 14px"><a href="' + base + '/api/public/media/' + b.media_id + '" style="color:#1c4f9c;font-weight:600;text-decoration:none">📎 ' + esc(b.name || 'Attachment') + '</a></div>')
    else if ((b.type === 'video' || b.type === 'deck') && b.url && /^https?:\/\//i.test(b.url)) out.push('<div style="margin:0 0 18px;border:1px solid #e6e4dd;padding:14px 16px;background:#f7f9fc"><div style="font-size:12px;color:#6b6b6b;text-transform:uppercase;letter-spacing:.08em">' + (b.type === 'video' ? 'Video' : 'Deck') + '</div><a href="' + esc(b.url) + '" style="color:#1c4f9c;font-weight:600;text-decoration:none;font-size:15px">' + esc(b.title || (b.type === 'video' ? 'Watch the video' : 'View our deck')) + ' →</a></div>')
  }
  return out.join('')
}
// The full email (or web) document for one reader.
export async function renderUpdateDoc(u: { title: string; blocks: Block[]; cover_id: string | null; from_name: string | null }, o: { company: string; base: string; email: boolean; greeting?: string; viewUrl?: string; unsubUrl?: string; pixelUrl?: string; logoUrl?: string | null; hideFinvry?: boolean }): Promise<string> {
  const body = await renderBlocks(u.blocks, o.base)
  const head = (o.logoUrl ? '<img src="' + o.logoUrl + '" alt="" style="max-height:44px;max-width:180px;display:block;margin:0 0 14px">' : '') + '<div style="font-size:13px;color:#6b6b6b;margin:0 0 6px">' + esc(u.from_name || o.company) + '</div><h1 style="font-family:Georgia,serif;font-weight:500;font-size:30px;line-height:1.2;color:#0c1a2e;margin:0 0 18px">' + esc(u.title) + '</h1>'
  const cover = u.cover_id ? '<img src="' + o.base + '/api/public/media/' + u.cover_id + '" alt="" style="width:100%;display:block;margin:0 0 20px">' : ''
  const hi = o.greeting ? '<p style="margin:0 0 14px">Hi ' + esc(o.greeting) + ',</p>' : ''
  const inner = head + cover + hi + body
  if (!o.email) return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15.5px;line-height:1.65;color:#1d1d1f">' + inner + '</div>'
  return '<!doctype html><html><body style="margin:0;background:#f4f3ef"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">' +
    (o.viewUrl ? '<div style="max-width:640px;font-size:12px;color:#8a8a8a;text-align:right;margin:0 0 8px;font-family:Helvetica,Arial,sans-serif"><a href="' + o.viewUrl + '" style="color:#8a8a8a">View in browser</a></div>' : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff"><tr><td style="padding:32px 36px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15.5px;line-height:1.65;color:#1d1d1f">' + inner + '</td></tr></table>' +
    '<div style="max-width:640px;font-size:11.5px;color:#8a8a8a;margin:14px 0 0;font-family:Helvetica,Arial,sans-serif">Sent by ' + esc(o.company) + (o.hideFinvry ? '.' : ' with Finvry.') + (o.unsubUrl ? ' <a href="' + o.unsubUrl + '" style="color:#8a8a8a">Unsubscribe</a>' : '') + '</div>' +
    (o.pixelUrl ? '<img src="' + o.pixelUrl + '" width="1" height="1" alt="" style="display:block">' : '') + '</td></tr></table></body></html>'
}
export function blocksText(blocks: Block[]): string { return blocks.filter((b) => b.type === 'text').map((b) => (b.md ?? '').replace(/[#*_>`]/g, '')).join('\n\n').slice(0, 4000) }
export interface Recipients { lists: string[]; stages: string[]; contacts: string[]; emails: string[] }
// Everyone an update goes to (unique emails), leaving out unsubscribed contacts.
export async function resolveRecipients(r: Recipients): Promise<{ email: string; name: string }[]> {
  const out = new Map<string, string>()
  const q = await db().query<{ email: string; name: string; subscribed: boolean }>(`SELECT DISTINCT c.email, c.name, c.subscribed FROM crm.contacts c WHERE c.id = ANY($1::uuid[])
      OR EXISTS (SELECT 1 FROM crm.list_members m WHERE m.contact_id = c.id AND m.list_id = ANY($2::uuid[]))
      OR EXISTS (SELECT 1 FROM crm.deals d WHERE d.contact_id = c.id AND d.stage_id = ANY($3::uuid[]))`, [r.contacts, r.lists, r.stages])
  for (const c of q.rows) if (c.subscribed) out.set(c.email, c.name)
  const blocked = new Set((await db().query<{ email: string }>('SELECT email FROM crm.contacts WHERE NOT subscribed AND email = ANY($1::text[])', [r.emails.map((e) => e.toLowerCase())])).rows.map((x) => x.email))
  for (const e of r.emails) { const x = e.trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && !blocked.has(x) && !out.has(x)) out.set(x, x.split('@')[0]!) }
  return [...out.entries()].map(([email, name]) => ({ email, name }))
}
