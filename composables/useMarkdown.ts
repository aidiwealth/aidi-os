// A small, safe Markdown renderer for investor updates: headings, bold, italics, bullets and paragraphs. HTML is escaped first.
export function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
  const out: string[] = []; let list = false
  for (const raw of src.split(/\r?\n/)) {
    const l = raw.trim()
    if (/^[-*] /.test(l)) { if (!list) { out.push('<ul>'); list = true } out.push('<li>' + inline(l.slice(2)) + '</li>'); continue }
    if (list) { out.push('</ul>'); list = false }
    if (!l) continue
    const h = l.match(/^(#{1,3}) (.*)$/)
    out.push(h ? '<h' + (h[1]!.length + 1) + '>' + inline(h[2]!) + '</h' + (h[1]!.length + 1) + '>' : '<p>' + inline(l) + '</p>')
  }
  if (list) out.push('</ul>')
  return out.join('')
}
