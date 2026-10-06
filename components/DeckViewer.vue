<script setup lang="ts">
// Slide-by-slide PDF viewer that reports time spent per slide.
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
const props = defineProps<{ src: string; onTrack?: (page: number, seconds: number, pages: number) => void }>()
const canvas = ref<HTMLCanvasElement | null>(null); const wrap = ref<HTMLDivElement | null>(null)
const page = ref(1); const pages = ref(0); const loading = ref(true); const failed = ref('')
let doc: pdfjs.PDFDocumentProxy | null = null; let since = Date.now(); let timer: ReturnType<typeof setInterval> | undefined; let task: { cancel: () => void } | null = null
function flush() { const s = Math.min(120, Math.round((Date.now() - since) / 1000)); since = Date.now(); if (s > 0 && pages.value && !document.hidden) props.onTrack?.(page.value, s, pages.value) }
async function render() {
  if (!doc || !canvas.value || !wrap.value) return
  const p = await doc.getPage(page.value); const base = p.getViewport({ scale: 1 })
  const scale = Math.min(wrap.value.clientWidth / base.width, (window.innerHeight - 170) / base.height) * (window.devicePixelRatio || 1)
  const vp = p.getViewport({ scale }); const c = canvas.value; c.width = vp.width; c.height = vp.height; c.style.width = vp.width / (window.devicePixelRatio || 1) + 'px'
  task?.cancel(); const t = p.render({ canvasContext: c.getContext('2d')!, viewport: vp }); task = t; try { await t.promise } catch { /* cancelled */ }
}
function go(n: number) { if (n < 1 || n > pages.value || n === page.value) return; flush(); page.value = n; render() }
function key(e: KeyboardEvent) { if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') go(page.value + 1); if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(page.value - 1) }
onMounted(async () => {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  try { const bytes = await (await fetch(props.src)).arrayBuffer(); doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise; pages.value = doc.numPages; loading.value = false; await nextTick(); await render() } catch { failed.value = 'Could not open the deck.'; loading.value = false }
  timer = setInterval(flush, 10000); window.addEventListener('keydown', key); window.addEventListener('resize', render); document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else since = Date.now() }); window.addEventListener('pagehide', flush)
})
onBeforeUnmount(() => { flush(); clearInterval(timer); window.removeEventListener('keydown', key); window.removeEventListener('resize', render) })
</script>
<template>
  <div ref="wrap" class="dv"><p v-if="loading" class="mut">Loading the deck…</p><p v-if="failed" class="error">{{ failed }}</p>
    <canvas v-show="!loading && !failed" ref="canvas" class="cv" @click="go(page + 1)" />
    <div v-if="pages" class="nav"><button :disabled="page <= 1" @click="go(page - 1)">‹ Previous</button><span>{{ page }} / {{ pages }}</span><button :disabled="page >= pages" @click="go(page + 1)">Next ›</button></div></div>
</template>
<style scoped>
.dv { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; } .cv { box-shadow: 0 8px 32px rgba(12,26,46,.14); background: #fff; cursor: pointer; max-width: 100%; }
.nav { display: flex; gap: 16px; align-items: center; font-size: 14px; } .nav button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 7px 14px; font: inherit; cursor: pointer; } .nav button:disabled { opacity: .4; cursor: default; } .mut { color: var(--c-muted); } .error { color: var(--c-danger); }
</style>
