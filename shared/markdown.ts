// One safe Markdown renderer for the app, emails and pages. HTML in the text is always escaped first.
// Supports headings, paragraphs, bold, italic, strikethrough, inline code, links, bullet and numbered lists, quotes and dividers.
export type MdStyles = Partial<Record<'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'li' | 'quote' | 'hr' | 'a' | 'code', string>>
export function mdRender(src: string, st: MdStyles = {}): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const sa = (k: keyof MdStyles) => (st[k] ? ' style="' + st[k] + '"' : '')
  const inline = (raw: string) => {
    const keep: string[] = []
    let s = raw.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, (_, c: string) => { keep.push(c); return '\u0000' + (keep.length - 1) + '\u0000' })
    s = esc(s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (_, e: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'", nbsp: ' ' } as Record<string, string>)[e] ?? ''))
    s = s.replace(/`([^`]+)`/g, (_, c: string) => '<code' + sa('code') + '>' + c + '</code>')
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, t: string, u: string) => '<a href="' + u + '" target="_blank" rel="noopener"' + sa('a') + '>' + t + '</a>')
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>')
    s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>')
    s = s.replace(/~~(.+?)~~/g, '<s>$1</s>')
    return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => esc(keep[Number(i)] ?? ''))
  }
  const out: string[] = []; let list: 'ul' | 'ol' | null = null; let quote: string[] = []
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null } }
  const closeQuote = () => { if (quote.length) { out.push('<blockquote' + sa('quote') + '>' + quote.map((q) => '<p' + sa('p') + '>' + inline(q) + '</p>').join('') + '</blockquote>'); quote = [] } }
  for (const rawLine of String(src ?? '').split(/\r?\n/)) {
    const l = rawLine.replace(/\s+$/, '').trim()
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
  return s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (_, e: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'", nbsp: ' ' } as Record<string, string>)[e] ?? '').replace(/\[([^\]]+)\]\((\S+?)\)/g, '$1 ($2)').replace(/\*\*|__|~~|`/g, '').replace(/(^|\W)[*_](\S.*?)[*_](?=\W|$)/g, '$1$2').replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1')
}
