<script setup lang="ts">
// Shows text written in the editor as it was written: headings, lists, links, tables, pictures, and video links as
// players. Plain text from older records shows as paragraphs.
const props = withDefaults(defineProps<{ md: string | null | undefined; videos?: boolean }>(), { videos: true })
const html = computed(() => renderMarkdown(props.md ?? '', { videos: props.videos }))
</script>
<template>
  <div class="rv" v-html="html" />
</template>
<style scoped>
.rv { font-size: 15px; line-height: 1.65; color: var(--c-ink); overflow-wrap: anywhere; }
.rv :deep(p) { margin: 0 0 10px; } .rv :deep(> :last-child) { margin-bottom: 0; }
.rv :deep(h2), .rv :deep(h3), .rv :deep(h4) { font-family: var(--font-heading); font-weight: 500; color: var(--c-navy); margin: 16px 0 6px; line-height: 1.25; }
.rv :deep(h2) { font-size: 22px; } .rv :deep(h3) { font-size: 18px; } .rv :deep(h4) { font-size: 16px; }
.rv :deep(ul), .rv :deep(ol) { padding-left: 22px; margin: 0 0 10px; } .rv :deep(li) { margin: 2px 0; }
.rv :deep(blockquote) { border-left: 3px solid var(--c-rule-strong); margin: 0 0 10px; padding-left: 14px; color: var(--c-ink-soft); }
.rv :deep(a) { color: var(--c-blue-deep); } .rv :deep(img) { max-width: 100%; height: auto; display: block; margin: 6px 0 12px; }
.rv :deep(hr) { border: 0; border-top: 1px solid var(--c-rule); margin: 14px 0; }
.rv :deep(code) { font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: var(--c-paper-2); padding: 1px 5px; }
.rv :deep(.vlink) { margin: 4px 0 8px; font-size: 13.5px; }
.rv :deep(.vid) { position: relative; width: 100%; max-width: 720px; aspect-ratio: 16 / 9; background: #0c1a2e; margin: 0 0 14px; }
.rv :deep(.vid iframe) { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
</style>
