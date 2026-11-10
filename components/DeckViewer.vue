<script setup lang="ts">
// Slide-by-slide PDF viewer that reports time spent per slide. mark: a watermark laid over the pages when the server
// could not stamp the file itself (a protected PDF).
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
const props = defineProps<{ src: string; mark?: string | null; onTrack?: (page: number, seconds: number, pages: number) => void }>()
const overlay = ref('')
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
  try {
    const res = await fetch(props.src)
    // The server's own reason (an expired view, a refused file) rather than a general error.
    if (!res.ok) { const j = await res.json().catch(() => null) as { data?: { error?: { message?: string } }; message?: string } | null; throw new Error(j?.data?.error?.message || j?.message || '') }
    if (res.headers.get('x-unstamped') === '1' && props.mark) overlay.value = props.mark
    const bytes = await res.arrayBuffer(); doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise; pages.value = doc.numPages; loading.value = false; await nextTick(); await render()
  } catch (e) { failed.value = (e as Error).message || 'Could not open this file. Try again, or ask the company for a fresh copy.'; loading.value = false }
  timer = setInterval(flush, 10000); window.addEventListener('keydown', key); window.addEventListener('resize', render); document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else since = Date.now() }); window.addEventListener('pagehide', flush)
})
onBeforeUnmount(() => { flush(); clearInterval(timer); window.removeEventListener('keydown', key); window.removeEventListener('resize', render) })
</script>
<template>
  <div ref="wrap" class="dv"><p v-if="loading" class="mut">Loading the deck…</p><p v-if="failed" class="error">{{ failed }}</p>
    <div v-show="!loading && !failed" class="cvw"><canvas ref="canvas" class="cv" @click="go(page + 1)" /><div v-if="overlay" class="ov" aria-hidden="true"><span v-for="n in 40" :key="n">{{ overlay }}</span></div></div>
    <div v-if="pages" class="nav"><button :disabled="page <= 1" @click="go(page - 1)">‹ Previous</button><span>{{ page }} / {{ pages }}</span><button :disabled="page >= pages" @click="go(page + 1)">Next ›</button></div></div>
</template>
<style scoped>
.dv { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; } .cvw { position: relative; max-width: 100%; display: flex; } .ov { position: absolute; inset: 0; overflow: hidden; pointer-events: none; display: flex; flex-wrap: wrap; align-content: space-around; justify-content: space-around; gap: 60px 80px; padding: 20px; transform: rotate(-24deg) scale(1.4); opacity: .13; } .ov span { font: 600 20px/1 sans-serif; color: #0c1a2e; white-space: nowrap; user-select: none; }
.cv { box-shadow: 0 8px 32px rgba(12,26,46,.14); background: #fff; cursor: pointer; max-width: 100%; }
.nav { display: flex; gap: 16px; align-items: center; font-size: 14px; } .nav button { background: #fff; border: 1px solid var(--c-rule-strong); padding: 7px 14px; font: inherit; cursor: pointer; } .nav button:disabled { opacity: .4; cursor: default; } .mut { color: var(--c-muted); } .error { color: var(--c-danger); }
</style>
