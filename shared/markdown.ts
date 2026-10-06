import MarkdownIt from 'markdown-it'
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
const mdi = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })
// Render Markdown (as written by the editor) to HTML. HTML in the text is escaped, except editor tables, which are
// rebuilt from an allow-list. `st` adds inline styles (used for emails).
export function mdRender(src: string, st: MdStyles = {}): string {
  const tables: string[] = []
  const text = String(src ?? '').replace(/<table[\s\S]*?<\/table>/gi, (h) => { tables.push(h); return '\n\nMDTABLE' + (tables.length - 1) + 'X\n\n' })
  const tokens = mdi.parse(text, {})
  const style = (tok: { attrSet: (k: string, v: string) => void }, k: keyof MdStyles) => { if (st[k]) tok.attrSet('style', st[k]!) }
  const cell = 'border:1px solid #d9d6cf;padding:8px 10px;text-align:left;vertical-align:top'
  const walk = (list: typeof tokens) => { for (const tok of list) {
    switch (tok.type) {
      case 'paragraph_open': style(tok, 'p'); break
      case 'heading_open': { const n = Math.min(3, Number(tok.tag.slice(1))); tok.tag = 'h' + Math.min(4, n + 1); style(tok, ('h' + n) as 'h1'); break }
      case 'heading_close': tok.tag = 'h' + Math.min(4, Math.min(3, Number(tok.tag.slice(1))) + 1); break
      case 'bullet_list_open': style(tok, 'ul'); break
      case 'ordered_list_open': style(tok, 'ol'); break
      case 'list_item_open': style(tok, 'li'); break
      case 'blockquote_open': style(tok, 'quote'); break
      case 'hr': style(tok, 'hr'); break
      case 'table_open': tok.attrSet('style', 'border-collapse:collapse;width:100%;margin:0 0 18px;font-size:14px;line-height:1.5'); break
      case 'th_open': tok.attrSet('style', cell + ';background-color:#eef3fa;font-weight:600'); break
      case 'td_open': tok.attrSet('style', cell); break
      case 'code_inline': style(tok, 'code'); break
      case 'link_open': { const href = tok.attrGet('href') ?? ''; if (!/^(https?:|mailto:)/i.test(href)) tok.attrSet('href', '#'); tok.attrSet('target', '_blank'); tok.attrSet('rel', 'noopener'); style(tok, 'a'); break }
      case 'image': { const srcA = tok.attrGet('src') ?? ''; if (!/^https?:/i.test(srcA)) tok.attrSet('src', ''); tok.attrSet('style', 'max-width:100%;height:auto'); break }
    }
    if (tok.children) walk(tok.children as typeof tokens)
  } }
  walk(tokens)
  let html = mdi.renderer.render(tokens, mdi.options, {})
  html = html.replace(/<p[^>]*>MDTABLE(\d+)X<\/p>\n?/g, (_m, i: string) => renderTable(tables[Number(i)] ?? ''))
  return html.replace(/>\n+</g, '><').trim()
}
// Plain text from Markdown (for PDFs and text email parts).
export function mdPlain(s: string): string {
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (h) => '\n' + h.replace(/<\/(th|td)>/gi, ' | ').replace(/<\/tr>/gi, '\n').replace(/<[^>]+>/g, '').replace(/ \| \n/g, '\n') + '\n')
  return s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (_, e: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'", nbsp: ' ' } as Record<string, string>)[e] ?? '').replace(/\[([^\]]+)\]\((\S+?)\)/g, '$1 ($2)').replace(/\*\*|__|~~|`/g, '').replace(/(^|\W)[*_](\S.*?)[*_](?=\W|$)/g, '$1$2').replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1')
}
