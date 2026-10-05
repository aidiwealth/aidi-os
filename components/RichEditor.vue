<script setup lang="ts">
// Rich text editor (TipTap) that reads and writes Markdown. Toolbar plus shortcuts (Cmd/Ctrl+B, I, Z) and Markdown typing.
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
const props = withDefaults(defineProps<{ modelValue: string | null | undefined; placeholder?: string; minHeight?: number; compact?: boolean; maxLength?: number }>(), { placeholder: 'Write here…', minHeight: 160, compact: false, maxLength: 60000 })
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
let last = props.modelValue ?? ''
const md = (e: { storage: Record<string, unknown> }) => (e.storage.markdown as { getMarkdown: () => string }).getMarkdown()
const editor = useEditor({
  content: last,
  extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }), Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } }), Placeholder.configure({ placeholder: props.placeholder }),
    Markdown.configure({ html: false, tightLists: true, linkify: true, breaks: false, transformPastedText: true })],
  onUpdate: ({ editor: e }) => { let v = md(e); if (v.length > props.maxLength) v = v.slice(0, props.maxLength); last = v; emit('update:modelValue', v) }
})
watch(() => props.modelValue, (v) => { const e = editor.value; if (e && (v ?? '') !== last) { last = v ?? ''; e.commands.setContent(last, false) } })
onBeforeUnmount(() => editor.value?.destroy())
const block = computed({ get: () => { const e = editor.value; if (!e) return 'p'; for (const l of [1, 2, 3]) if (e.isActive('heading', { level: l })) return 'h' + l; return 'p' },
  set: (v: string) => { const c = editor.value?.chain().focus(); if (!c) return; if (v === 'p') c.setParagraph().run(); else c.toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run() } })
function link() { const e = editor.value; if (!e) return; const prev = e.getAttributes('link').href as string | undefined; const url = window.prompt('Link address', prev ?? 'https://'); if (url === null) return; if (!url || url === 'https://') { e.chain().focus().unsetLink().run(); return } if (!/^(https?:\/\/|mailto:)/i.test(url)) return; e.chain().focus().extendMarkRange('link').setLink({ href: url }).run() }
const on = (n: string, a?: Record<string, unknown>) => !!editor.value?.isActive(n, a)
</script>
<template>
  <div class="re" :class="{ compact }">
    <div v-if="editor" class="tb" role="toolbar" aria-label="Formatting">
      <select v-model="block" aria-label="Text style"><option value="p">Paragraph</option><option value="h1">Title</option><option value="h2">Heading</option><option value="h3">Subheading</option></select>
      <span class="sep" />
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
</style>
