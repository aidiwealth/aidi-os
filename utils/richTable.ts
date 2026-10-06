// Table support for the rich-text editor: cells and headers carry an optional background colour (data-bg); tables are
// stored in the Markdown as clean HTML so colours, header rows and merged cells survive.
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { DOMSerializer, type Node as PMNode } from '@tiptap/pm/model'
import { selectedRect, isInTable } from '@tiptap/pm/tables'
import type { Editor } from '@tiptap/core'
export const TABLE_COLORS: { name: string; v: string | null }[] = [
  { name: 'None', v: null }, { name: 'Navy', v: '#0c1a2e' }, { name: 'Blue', v: '#1c4f9c' }, { name: 'Light blue', v: '#e6eef9' },
  { name: 'Grey', v: '#f1f0ec' }, { name: 'Green', v: '#e3f2ea' }, { name: 'Amber', v: '#fdf1dc' }, { name: 'Red', v: '#fbe7e5' }]
const OK = new Set(TABLE_COLORS.map((c) => c.v).filter(Boolean) as string[])
const bg = {
  background: { default: null, parseHTML: (el: HTMLElement) => { const v = el.getAttribute('data-bg'); return v && OK.has(v) ? v : null },
    renderHTML: (a: { background?: string | null }) => (a.background ? { 'data-bg': a.background } : {}) } }
export const RichTableCell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...bg } } })
export const RichTableHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...bg } } })
export const RichTable = Table.extend({
  addStorage() {
    return { markdown: { serialize(state: { write: (s: string) => void; closeBlock: (n: PMNode) => void; ensureNewLine: () => void }, node: PMNode) {
      const el = document.createElement('div'); el.appendChild(DOMSerializer.fromSchema(node.type.schema).serializeNode(node))
      const html = el.innerHTML.replace(/<colgroup>[\s\S]*?<\/colgroup>/g, '').replace(/ style="[^"]*"/g, '').replace(/\n/g, ' ')
      state.ensureNewLine(); state.write(html); state.closeBlock(node) }, parse: {} } }
  } }).configure({ resizable: false })
export const RICH_TABLE_EXTENSIONS = [RichTable, TableRow, RichTableHeader, RichTableCell]
// Pasted tables (Word, Google Docs, Excel): drop their styling; make the first row a header if none is marked.
export function cleanPastedHtml(html: string): string {
  if (!/<table/i.test(html)) return html
  return html.replace(/<table[\s\S]*?<\/table>/gi, (t) => {
    let s = t.replace(/<(\/?)(table|thead|tbody|tfoot|tr|td|th)\b[^>]*?((?:\s(?:colspan|rowspan)="\d+")*)[^>]*>/gi, (_m, sl: string, tag: string, spans: string) => '<' + sl + tag.toLowerCase() + (sl ? '' : (spans.match(/\s(?:colspan|rowspan)="\d+"/gi) ?? []).join('')) + '>')
    s = s.replace(/<\/?(colgroup|col|o:p|font|span)[^>]*>/gi, '')
    if (!/<th[\s>]/i.test(s)) s = s.replace(/<tr>([\s\S]*?)<\/tr>/i, (_m, row: string) => '<tr>' + row.replace(/<td(\b[^>]*)>/gi, '<th$1>').replace(/<\/td>/gi, '</th>') + '</tr>')
    return s
  })
}
// Colour the current cell(s), or the whole row(s) or column(s) of the selection.
export function paintTable(e: Editor, scope: 'cell' | 'row' | 'col' | 'header', color: string | null) {
  const { state } = e
  if (!isInTable(state)) return
  if (scope === 'cell') { e.chain().focus().setCellAttribute('background', color).run(); return }
  const rect = selectedRect(state); const tr = state.tr; const seen = new Set<number>()
  for (let r = 0; r < rect.map.height; r++) for (let c = 0; c < rect.map.width; c++) {
    if (scope === 'row' && (r < rect.top || r >= rect.bottom)) continue
    if (scope === 'col' && (c < rect.left || c >= rect.right)) continue
    if (scope === 'header' && r !== 0) continue
    const pos = rect.map.map[r * rect.map.width + c]!; if (seen.has(pos)) continue; seen.add(pos)
    const abs = rect.tableStart + pos, node = tr.doc.nodeAt(abs); if (node) tr.setNodeMarkup(abs, undefined, { ...node.attrs, background: color })
  }
  e.view.dispatch(tr); e.commands.focus()
}
