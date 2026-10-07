<script setup lang="ts">
// Draw a signature with mouse, pen or finger. v-model is a PNG data URL ('' when empty).
const model = defineModel<string>({ default: '' })
const cv = ref<HTMLCanvasElement | null>(null); let drawing = false, last: [number, number] | null = null, dirty = false
function pos(e: PointerEvent): [number, number] { const r = cv.value!.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.value!.width / r.width), (e.clientY - r.top) * (cv.value!.height / r.height)] }
function down(e: PointerEvent) { drawing = true; last = pos(e); cv.value!.setPointerCapture(e.pointerId) }
function move(e: PointerEvent) { if (!drawing || !last) return; const c = cv.value!.getContext('2d')!, p = pos(e); c.strokeStyle = '#0c1a2e'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(last[0], last[1]); c.lineTo(p[0], p[1]); c.stroke(); last = p; dirty = true }
function up() { drawing = false; last = null; if (dirty) model.value = cv.value!.toDataURL('image/png') }
function clear() { const c = cv.value!.getContext('2d')!; c.clearRect(0, 0, cv.value!.width, cv.value!.height); dirty = false; model.value = '' }
</script>
<template><div class="sp"><canvas ref="cv" width="600" height="160" @pointerdown="down" @pointermove="move" @pointerup="up" @pointerleave="up" /><div class="sb"><span>Sign above</span><button type="button" @click="clear">Clear</button></div></div></template>
<style scoped>
.sp { border: 1px solid var(--c-rule-strong); background: #fff; } canvas { width: 100%; height: 140px; display: block; touch-action: none; cursor: crosshair; background: repeating-linear-gradient(transparent 0 118px, #e3e6ea 118px 119px, transparent 119px 140px); }
.sb { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 12px; color: var(--c-muted); border-top: 1px solid var(--c-rule); } .sb button { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12px; }
</style>
