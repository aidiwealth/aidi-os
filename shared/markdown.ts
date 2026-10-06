// One safe Markdown renderer for the app, emails and pages. HTML in the text is always escaped first.
// Supports headings, paragraphs, bold, italic, strikethrough, inline code, links, bullet and numbered lists, quotes and dividers.
export type MdStyles = Partial<Record<'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'li' | 'quote' | 'hr' | 'a' | 'code', string>>
const TABLE_BG = new Set(['#0c1a2e', '#1c4f9c', '#e6eef9', '#f1f0ec', '#e3f2ea', '#fdf1dc', '#fbe7e5'])
const DARK_BG = new Set(['#0c1a2e', '#1c4f9c'])
// Rebuild an editor table from its HTML, keeping only table structure, spans, colours, links and simple formatting.
function renderTable(html: string): string {
  const cellBase = 'border:1px solid #d9d6cf;padding:8px 10px;text-align:left;vertical-align:top'
  let out = ''
  for (const part of html.split(/(<[^>]*>)/g)) {
    if (!part) continue
    if (!part.startsWith('<')) { out += part.replace(/</g, '&lt;').replace(/>/g, '&gt;'); continue }
    const m = part.match(/^<(\/?)([a-z0-9]+)\b([^>]*)>$/i); if (!m) { out += part.replace(/</g, '&lt;').replace(/>/g, '&gt;'); continue }
    const close = m[1] === '/', tag = m[2]!.toLowerCase(), attrs = m[3] ?? ''
    if (!['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'p', 'strong', 'b', 'em', 'i', 's', 'code', 'br', 'a', 'ul', 'ol', 'li'].includes(tag)) continue
    if (close) { out += '</' + tag + '>'; continue }
    if (tag === 'table') { out += '<table style="border-collapse:collapse;width:100%;margin:0 0 18px;font-size:14px;line-height:1.5">'; continue }
    if (tag === 'th' || tag === 'td') {
      const spans = (attrs.match(/\s(colspan|rowspan)="\d{1,2}"/gi) ?? []).join(''), bg = attrs.match(/data-bg="(#[0-9a-f]{6})"/i)?.[1]?.toLowerCase()
      const style = cellBase + (bg && TABLE_BG.has(bg) ? ';background-color:' + bg + (DARK_BG.has(bg) ? ';color:#ffffff' : '') : tag === 'th' ? ';background-color:#eef3fa' : '') + (tag === 'th' ? ';font-weight:600' : '')
      out += '<' + tag + spans + ' style="' + style + '">'; continue }
    if (tag === 'p') { out += '<p style="margin:0">'; continue }
    if (tag === 'a') { const href = attrs.match(/href="(https?:\/\/[^"]+|mailto:[^"]+)"/i)?.[1]; out += href ? '<a href="' + href.replace(/"/g, '') + '" target="_blank" rel="noopener">' : '<a>'; continue }
    out += '<' + tag + '>'
  }
  return '<div style="overflow-x:auto">' + out + '</div>'
}
function pipeTable(lines: string[], inline: (s: string) => string): string {
  const cells = (l: string) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const head = cells(lines[0]!), body = lines.slice(2).map(cells), cs = 'border:1px solid #d9d6cf;padding:8px 10px;text-align:left;vertical-align:top'
  return '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;margin:0 0 18px;font-size:14px;line-height:1.5"><thead><tr>' + head.map((h) => '<th style="' + cs + ';background-color:#eef3fa;font-weight:600">' + inline(h) + '</th>').join('') + '</tr></thead><tbody>' +
    body.map((r) => '<tr>' + r.map((c) => '<td style="' + cs + '">' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'
}
export function mdRender(src: string, st: MdStyles = {}): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const sa = (k: keyof MdStyles) => (st[k] ? ' style="' + st[k] + '"' : '')
  const inline = (raw: string) => {
    const keep: string[] = []
    let s = raw.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, (_, c: string) => { keep.push(c); return '\u0000' + (keep.length - 1) + '\u0000' })
    s = esc(s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (_, e: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'", nbsp: ' ' } as Record<string, string>)[e] ?? ''))
    s = s.replace(/`([^`]+)`/g, (_, c: string) => '<code' + sa('code') + '>' + c + '</code>')
    s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, a: string, u: string) => '<img src="' + u + '" alt="' + a.replace(/"/g, '') + '" style="max-width:100%;height:auto">')
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, t: string, u: string) => '<a href="' + u + '" target="_blank" rel="noopener"' + sa('a') + '>' + t + '</a>')
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>')
    s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>')
    s = s.replace(/~~(.+?)~~/g, '<s>$1</s>')
    return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => esc(keep[Number(i)] ?? ''))
  }
  const out: string[] = []; let list: 'ul' | 'ol' | null = null; let quote: string[] = []
  const tables: string[] = []
  src = String(src ?? '').replace(/<table[\s\S]*?<\/table>/gi, (h) => { tables.push(h); return '\n\u0001T' + (tables.length - 1) + '\u0001\n' })
  const lines = String(src ?? '').split(/\r?\n/)
  const piped: Record<number, number> = {}
  for (let i = 0; i < lines.length - 1; i++) if (/^\s*\|.*\|\s*$/.test(lines[i]!) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1]!)) { let j = i + 2; while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j]!)) j++; piped[i] = j; i = j - 1 }
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null } }
  const closeQuote = () => { if (quote.length) { out.push('<blockquote' + sa('quote') + '>' + quote.map((q) => '<p' + sa('p') + '>' + inline(q) + '</p>').join('') + '</blockquote>'); quote = [] } }
  for (let li = 0; li < lines.length; li++) {
    if (piped[li] !== undefined) { closeQuote(); closeList(); out.push(pipeTable(lines.slice(li, piped[li]).map((x) => x.trim()), inline)); li = piped[li]! - 1; continue }
    const rawLine = lines[li]!
    const l = rawLine.replace(/\s+$/, '').trim()
    const tm = l.match(/^\u0001T(\d+)\u0001$/)
    if (tm) { closeQuote(); closeList(); out.push(renderTable(tables[Number(tm[1])] ?? '')); continue }
    if (/^>\s?/.test(l)) { closeList(); quote.push(l.replace(/^>\s?/, '')); continue }
    closeQuote()
    const ul = l.match(/^[-*+]\s+(.*)$/), ol = l.match(/^(\d+)[.)]\s+(.*)$/)
    if (ul && !/^(-{3,}|\*{3,})$/.test(l)) { if (list !== 'ul') { closeList(); out.push('<ul' + sa('ul') + '>'); list = 'ul' } out.push('<li' + sa('li') + '>' + inline(ul[1]!) + '</li>'); continue }
    if (ol) { if (list !== 'ol') { closeList(); out.push('<ol' + sa('ol') + (ol[1] !== '1' ? ' start="' + ol[1] + '"' : '') + '>'); list = 'ol' } out.push('<li' + sa('li') + '>' + inline(ol[2]!) + '</li>'); continue }
    closeList()
    if (!l) continue
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(l)) { out.push('<hr' + sa('hr') + '>'); continue }
    const h = l.match(/^(#{1,3})\s+(.*)$/)
    if (h) { const n = h[1]!.length, k = ('h' + n) as 'h1' | 'h2' | 'h3'; out.push('<h' + (n + 1) + sa(k) + '>' + inline(h[2]!) + '</h' + (n + 1) + '>'); continue }
    out.push('<p' + sa('p') + '>' + inline(l) + '</p>')
  }
  closeQuote(); closeList()
  return out.join('')
}
// Plain text from Markdown (for PDFs and text email parts).
export function mdPlain(s: string): string {
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (h) => '\n' + h.replace(/<\/(th|td)>/gi, ' | ').replace(/<\/tr>/gi, '\n').replace(/<[^>]+>/g, '').replace(/ \| \n/g, '\n') + '\n')
  return s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (_, e: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'", nbsp: ' ' } as Record<string, string>)[e] ?? '').replace(/\[([^\]]+)\]\((\S+?)\)/g, '$1 ($2)').replace(/\*\*|__|~~|`/g, '').replace(/(^|\W)[*_](\S.*?)[*_](?=\W|$)/g, '$1$2').replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1')
}
