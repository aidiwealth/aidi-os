<script setup lang="ts">
// One figure against what is usual: a bar split into risk / watch / good ranges, the company's mark on it, and which
// way it has moved. `lowerIsBetter` flips the ranges (churn, concentration, payback).
const props = withDefaults(defineProps<{ label: string; value: number | null; unit?: '%' | '×' | 'mo'; bands: [number, number]; max: number; lowerIsBetter?: boolean; prev?: number | null; prevLabel?: string; hint?: string }>(), { unit: '%', lowerIsBetter: false, prev: null, prevLabel: '3 months ago', hint: '' })
const pos = (v: number) => Math.max(0, Math.min(100, (v / props.max) * 100))
const zone = computed(() => { const v = props.value; if (v == null) return ''; const [a, b] = props.bands; return props.lowerIsBetter ? (v <= a ? 'good' : v <= b ? 'watch' : 'risk') : (v >= b ? 'good' : v >= a ? 'watch' : 'risk') })
const WORD: Record<string, string> = { good: 'Healthy', watch: 'Watch', risk: 'Needs work' }
const fmt = (v: number) => (props.unit === '%' ? Math.round(v * 10) / 10 + '%' : props.unit === '×' ? Math.round(v * 10) / 10 + '×' : Math.round(v) + ' mo')
const move = computed(() => { if (props.value == null || props.prev == null) return null; const d = props.value - props.prev; if (Math.abs(d) < 0.05) return { t: 'flat', d }; const better = props.lowerIsBetter ? d < 0 : d > 0; return { t: better ? 'up' : 'down', d } })
const segs = computed(() => { const [a, b] = props.bands; const z = props.lowerIsBetter ? ['good', 'watch', 'risk'] : ['risk', 'watch', 'good']; return [{ z: z[0], l: 0, w: pos(a) }, { z: z[1], l: pos(a), w: pos(b) - pos(a) }, { z: z[2], l: pos(b), w: 100 - pos(b) }] })
</script>

<template>
  <div class="bb">
    <div class="bb-h"><span class="bb-l">{{ label }}</span><span v-if="zone" class="bb-z" :class="zone">{{ WORD[zone] }}</span></div>
    <div class="bb-v"><b>{{ value == null ? '—' : fmt(value) }}</b>
      <span v-if="move" class="bb-m" :class="move.t">{{ move.t === 'flat' ? '→ steady' : (move.d > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(move.d)).replace(' mo', '') + (unit === '%' ? ' pts' : '') }} <em>vs {{ prevLabel }}</em></span></div>
    <div class="bb-t"><i v-for="s in segs" :key="s.z" :class="s.z" :style="{ left: s.l + '%', width: s.w + '%' }" /><u v-if="value != null" :style="{ left: pos(value) + '%' }" /></div>
    <div class="bb-s"><span>{{ lowerIsBetter ? 'Good below ' + fmt(bands[0]) : 'Good from ' + fmt(bands[1]) }}</span><span v-if="hint">{{ hint }}</span></div>
  </div>
</template>

<style scoped>
.bb { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border: 1px solid var(--c-line-soft, var(--c-rule)); background: var(--c-paper, #fff); min-width: 0; }
.bb-h { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .bb-l { font-size: 13px; font-weight: 500; color: var(--c-muted); }
.bb-z { font-size: 11px; padding: 1px 7px; } .bb-z.good { background: #e8eef8; color: var(--c-navy); } .bb-z.watch { background: #f3f1ec; color: #6b5a2e; } .bb-z.risk { background: #f8e8e6; color: #9b3b32; }
.bb-v { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; } .bb-v b { font-family: var(--font-heading); font-size: 26px; line-height: 1.15; font-weight: 500; letter-spacing: -.02em; color: var(--c-navy); font-variant-numeric: tabular-nums; }
.bb-m { font-size: 12px; } .bb-m em { font-style: normal; color: var(--c-muted); } .bb-m.up { color: var(--c-navy); } .bb-m.down { color: #b2453b; } .bb-m.flat { color: var(--c-muted); }
.bb-t { position: relative; height: 8px; margin-top: 4px; } .bb-t i { position: absolute; top: 0; bottom: 0; } .bb-t i.risk { background: #efcfcb; } .bb-t i.watch { background: #e9e5dc; } .bb-t i.good { background: #c9d6ea; }
.bb-t u { position: absolute; top: -4px; bottom: -4px; width: 3px; margin-left: -1px; background: var(--c-navy); text-decoration: none; }
.bb-s { display: flex; justify-content: space-between; gap: 8px; font-size: 11.5px; color: var(--c-muted); }
</style>
