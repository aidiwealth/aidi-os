<script setup lang="ts">
// Rich text editor (TipTap) that reads and writes Markdown. Toolbar plus shortcuts (Cmd/Ctrl+B, I, Z) and Markdown typing.
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'
import { RICH_TABLE_EXTENSIONS, TABLE_COLORS, cleanPastedHtml, paintTable } from '~/utils/richTable'
const props = withDefaults(defineProps<{ imageUpload?: (f: File) => Promise<string>; modelValue: string | null | undefined; placeholder?: string; minHeight?: number; compact?: boolean; maxLength?: number }>(), { placeholder: 'Write here…', minHeight: 160, compact: false, maxLength: 60000 })
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
let last = props.modelValue ?? ''
const md = (e: { storage: Record<string, unknown> }) => (e.storage.markdown as { getMarkdown: () => string }).getMarkdown()
const editor = useEditor({
  content: last,
  extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }), Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } }), Placeholder.configure({ placeholder: props.placeholder }), Image.configure({ inline: false, HTMLAttributes: { style: 'max-width:100%;height:auto' } }),
    ...RICH_TABLE_EXTENSIONS,
    Markdown.configure({ html: true, tightLists: true, linkify: true, breaks: false, transformPastedText: true })],
  editorProps: { transformPastedHTML: cleanPastedHtml },
  onUpdate: ({ editor: e }) => { let v = md(e); if (v.length > props.maxLength) v = v.slice(0, props.maxLength); last = v; emit('update:modelValue', v) }
})
watch(() => props.modelValue, (v) => { const e = editor.value; if (e && (v ?? '') !== last) { last = v ?? ''; e.commands.setContent(last, false) } })
onBeforeUnmount(() => editor.value?.destroy())
const block = computed({ get: () => { const e = editor.value; if (!e) return 'p'; for (const l of [1, 2, 3]) if (e.isActive('heading', { level: l })) return 'h' + l; return 'p' },
  set: (v: string) => { const c = editor.value?.chain().focus(); if (!c) return; if (v === 'p') c.setParagraph().run(); else c.toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run() } })
function link() { const e = editor.value; if (!e) return; const prev = e.getAttributes('link').href as string | undefined; const url = window.prompt('Link address', prev ?? 'https://'); if (url === null) return; if (!url || url === 'https://') { e.chain().focus().unsetLink().run(); return } if (!/^(https?:\/\/|mailto:)/i.test(url)) return; e.chain().focus().extendMarkRange('link').setLink({ href: url }).run() }
const on = (n: string, a?: Record<string, unknown>) => !!editor.value?.isActive(n, a)
async function addImage(ev: Event) { const file = (ev.target as HTMLInputElement).files?.[0]; if (!file || !props.imageUpload || !editor.value) return; try { const src = await props.imageUpload(file); editor.value.chain().focus().setImage({ src, alt: file.name.replace(/\.[a-z]+$/i, '') }).run() } catch { /* the caller shows the error */ } finally { (ev.target as HTMLInputElement).value = '' } }
const inTable = computed(() => !!editor.value?.isActive('table'))
const tcolor = ref<string | null>(null); const tscope = ref<'cell' | 'row' | 'col' | 'header'>('row')
function insertTable() { editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }
function paint(c: string | null) { tcolor.value = c; if (editor.value) paintTable(editor.value, tscope.value, c) }
const tcmd = (fn: string) => { const c = editor.value?.chain().focus() as unknown as Record<string, () => { run: () => void }>; c?.[fn]?.().run() }
</script>
<template>
  <div class="re" :class="{ compact }">
    <div v-if="editor" class="tb" role="toolbar" aria-label="Formatting">
      <select v-model="block" aria-label="Text style"><option value="p">Paragraph</option><option value="h1">Title</option><option value="h2">Heading</option><option value="h3">Subheading</option></select>
      <span class="sep" />
      <label v-if="imageUpload" class="imgbtn" title="Insert image"><input type="file" accept=".png,.jpg,.jpeg,.gif,.webp" @change="addImage">Image</label>
      <button type="button" :class="{ on: on('bold') }" title="Bold (Ctrl+B)" @click="editor.chain().focus().toggleBold().run()"><b>B</b></button>
      <button type="button" :class="{ on: on('italic') }" title="Italic (Ctrl+I)" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></button>
      <button type="button" :class="{ on: on('strike') }" title="Strikethrough" @click="editor.chain().focus().toggleStrike().run()"><s>S</s></button>
      <button type="button" :class="{ on: on('code') }" title="Inline code" @click="editor.chain().focus().toggleCode().run()">&lt;/&gt;</button>
      <span class="sep" />
      <button type="button" :class="{ on: on('bulletList') }" title="Bullet list" @click="editor.chain().focus().toggleBulletList().run()"><svg viewBox="0 0 20 20" fill="currentColor"><circle cx="4" cy="5" r="1.6" /><circle cx="4" cy="10" r="1.6" /><circle cx="4" cy="15" r="1.6" /><rect x="8" y="4" width="10" height="2" /><rect x="8" y="9" width="10" height="2" /><rect x="8" y="14" width="10" height="2" /></svg></button>
      <button type="button" :class="{ on: on('orderedList') }" title="Numbered list" @click="editor.chain().focus().toggleOrderedList().run()"><svg viewBox="0 0 20 20" fill="currentColor"><text x="1.5" y="7" font-size="5.5" font-family="sans-serif">1</text><text x="1.5" y="12" font-size="5.5" font-family="sans-serif">2</text><text x="1.5" y="17" font-size="5.5" font-family="sans-serif">3</text><rect x="8" y="4" width="10" height="2" /><rect x="8" y="9" width="10" height="2" /><rect x="8" y="14" width="10" height="2" /></svg></button>
      <button type="button" :class="{ on: on('blockquote') }" title="Quote" @click="editor.chain().focus().toggleBlockquote().run()">❝</button>
      <button type="button" :class="{ on: on('link') }" title="Link" @click="link"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L10 5" /><path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" /></svg></button>
      <button type="button" title="Divider" @click="editor.chain().focus().setHorizontalRule().run()">―</button>
      <span class="sep" />
      <button type="button" title="Undo (Ctrl+Z)" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">↶</button>
      <button type="button" title="Redo (Ctrl+Shift+Z)" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">↷</button>
      <button type="button" title="Clear formatting" @click="editor.chain().focus().unsetAllMarks().clearNodes().run()">⌫</button>
      <span class="sep" />
      <button type="button" title="Insert a table" :class="{ on: inTable }" @click="insertTable"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="3.5" width="15" height="13" rx="1" /><path d="M2.5 8h15M2.5 12.3h15M7.5 3.5v13M12.5 3.5v13" /></svg></button>
    </div>
    <div v-if="editor && inTable" class="ttb" role="toolbar" aria-label="Table">
      <span class="tl">Table</span>
      <button type="button" title="Add row below" @click="tcmd('addRowAfter')">+ Row</button><button type="button" title="Add column to the right" @click="tcmd('addColumnAfter')">+ Column</button>
      <button type="button" title="Delete row" @click="tcmd('deleteRow')">− Row</button><button type="button" title="Delete column" @click="tcmd('deleteColumn')">− Column</button>
      <button type="button" title="Header row on/off" @click="tcmd('toggleHeaderRow')">Header row</button><button type="button" title="Header column on/off" @click="tcmd('toggleHeaderColumn')">Header column</button>
      <button type="button" title="Merge or split selected cells" @click="tcmd('mergeOrSplit')">Merge / split</button>
      <span class="sep" />
      <select v-model="tscope" title="What to colour" aria-label="What to colour"><option value="header">Colour header row</option><option value="row">Colour row</option><option value="col">Colour column</option><option value="cell">Colour cell(s)</option></select>
      <span class="sw"><button v-for="c in TABLE_COLORS" :key="c.name" type="button" :title="c.name" :class="{ none: !c.v }" :style="c.v ? { background: c.v } : {}" @click="paint(c.v)" /></span>
      <button type="button" class="del" title="Delete table" @click="tcmd('deleteTable')">Delete table</button>
    </div>
    <EditorContent :editor="editor" class="ec" :style="{ minHeight: minHeight + 'px' }" />
  </div>
</template>
<style scoped>
.re { border: 1px solid var(--c-rule-strong); background: #fff; display: flex; flex-direction: column; } .re:focus-within { border-color: var(--c-blue-deep); box-shadow: 0 0 0 3px var(--c-signal-soft); }
.tb { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; position: sticky; top: 0; z-index: 2; }
.tb button { min-width: 30px; height: 30px; display: grid; place-items: center; background: none; border: 0; cursor: pointer; font: inherit; font-size: 14px; color: var(--c-ink-soft); padding: 0 6px; } .tb button:hover { background: var(--c-paper-2); color: var(--c-ink); } .tb button.on { background: var(--c-signal-soft); color: var(--c-blue-deep); } .tb button:disabled { opacity: .35; cursor: default; }
.tb button svg { width: 16px; height: 16px; } .tb select { font: inherit; font-size: 13px; border: 0; background: transparent; padding: 4px 6px; color: var(--c-ink); cursor: pointer; } .sep { width: 1px; height: 18px; background: var(--c-rule); margin: 0 4px; }
.ec { padding: 12px 16px; cursor: text; } .ec :deep(.ProseMirror) { outline: none; min-height: inherit; font-size: 15.5px; line-height: 1.65; color: var(--c-ink); }
.ec :deep(.ProseMirror p) { margin: 0 0 10px; } .ec :deep(.ProseMirror h1) { font-family: var(--font-heading); font-weight: 500; font-size: 28px; color: var(--c-navy); margin: 14px 0 8px; } .ec :deep(.ProseMirror h2) { font-family: var(--font-heading); font-weight: 500; font-size: 22px; color: var(--c-navy); margin: 14px 0 6px; } .ec :deep(.ProseMirror h3) { font-size: 17px; font-weight: 600; margin: 12px 0 6px; }
.ec :deep(.ProseMirror ul), .ec :deep(.ProseMirror ol) { padding-left: 22px; margin: 0 0 10px; } .ec :deep(.ProseMirror blockquote) { border-left: 3px solid var(--c-rule-strong); margin: 0 0 10px; padding-left: 14px; color: var(--c-ink-soft); } .ec :deep(.ProseMirror hr) { border: 0; border-top: 1px solid var(--c-rule); margin: 16px 0; }
.ec :deep(.ProseMirror a) { color: var(--c-blue-deep); } .ec :deep(.ProseMirror code) { font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: var(--c-paper-2); padding: 1px 5px; }
.ec :deep(.ProseMirror p.is-editor-empty:first-child::before) { content: attr(data-placeholder); color: var(--c-muted); float: left; height: 0; pointer-events: none; }
.compact .ec :deep(.ProseMirror) { font-size: 14px; } .compact .tb { padding: 4px 6px; } .compact .tb button { min-width: 26px; height: 26px; }
.imgbtn { font-size: 12.5px; padding: 4px 8px; cursor: pointer; border: 1px solid var(--c-rule); background: #fff; } .imgbtn input { display: none; } :deep(.ProseMirror img) { max-width: 100%; height: auto; display: block; margin: 12px 0; }
.ttb { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--c-rule); background: #f7f9fc; font-size: 12.5px; }
.ttb button { background: #fff; border: 1px solid var(--c-rule); padding: 3px 8px; font: inherit; font-size: 12px; cursor: pointer; } .ttb button:hover { border-color: var(--c-navy); } .ttb .tl { font-weight: 600; color: var(--c-blue-deep); margin-right: 4px; } .ttb select { font: inherit; font-size: 12px; padding: 3px 6px; border: 1px solid var(--c-rule); }
.ttb .sw { display: flex; gap: 3px; } .ttb .sw button { width: 20px; height: 20px; padding: 0; border: 1px solid var(--c-rule-strong); } .ttb .sw button.none { background: linear-gradient(135deg, #fff 45%, #d64545 46%, #d64545 54%, #fff 55%); } .ttb .del { color: var(--c-danger); margin-left: auto; }
:deep(.ProseMirror table) { border-collapse: collapse; width: 100%; margin: 12px 0; table-layout: fixed; font-size: 14px; } :deep(.ProseMirror th), :deep(.ProseMirror td) { border: 1px solid #d9d6cf; padding: 7px 9px; vertical-align: top; text-align: left; position: relative; min-width: 60px; }
:deep(.ProseMirror th) { background: #eef3fa; font-weight: 600; } :deep(.ProseMirror td p), :deep(.ProseMirror th p) { margin: 0; }
:deep(.ProseMirror [data-bg]) { background: var(--bg); } :deep(.ProseMirror [data-bg="#0c1a2e"]) { background: #0c1a2e; color: #fff; } :deep(.ProseMirror [data-bg="#1c4f9c"]) { background: #1c4f9c; color: #fff; } :deep(.ProseMirror [data-bg="#e6eef9"]) { background: #e6eef9; } :deep(.ProseMirror [data-bg="#f1f0ec"]) { background: #f1f0ec; } :deep(.ProseMirror [data-bg="#e3f2ea"]) { background: #e3f2ea; } :deep(.ProseMirror [data-bg="#fdf1dc"]) { background: #fdf1dc; } :deep(.ProseMirror [data-bg="#fbe7e5"]) { background: #fbe7e5; }
:deep(.ProseMirror .selectedCell)::after { content: ''; position: absolute; inset: 0; background: rgba(28,79,156,.12); pointer-events: none; }
</style>
