<script setup lang="ts">
// One portfolio figure across reported periods (quarters or months) as flat bars, latest period in navy. Plain CSS.
import { compactNum } from '~/shared/compact'
const props = withDefaults(defineProps<{ title: string; sub?: string; unit: string; points: { label: string; value: number | null; partial?: boolean }[]; max?: number }>(), { sub: '', max: 8 })
// Periods before the first reported figure are left out, so a figure that started later is not mostly empty space.
const shown = computed(() => { const i = props.points.findIndex((p) => p.value != null); return (i < 0 ? [] : props.points.slice(i)).slice(-props.max) })
const top = computed(() => Math.max(1, ...shown.value.map((p) => Math.abs(p.value ?? 0))))
const fmt = (n: number | null) => n == null ? '—' : props.unit === 'usd' ? (n < 0 ? '-' : '') + '$' + (compactNum(Math.abs(n)) ?? Math.round(Math.abs(n)).toLocaleString('en-US')) : props.unit === 'pct' ? n.toFixed(0) + '%' : (compactNum(n) ?? Math.round(n).toLocaleString('en-US'))
const last = computed(() => [...shown.value].reverse().find((p) => p.value != null))
</script>
<template>
  <div class="card pb">
    <div class="hh"><div><h3>{{ title }}</h3><span v-if="sub" class="sb">{{ sub }}</span></div><b v-if="last">{{ fmt(last.value) }}</b></div>
    <div v-if="shown.some((p) => p.value != null)" class="bars" :style="{ gridTemplateColumns: 'repeat(' + Math.max(shown.length, 4) + ', minmax(0, 1fr))' }">
      <div v-for="(p, i) in shown" :key="p.label" class="col" :class="{ cur: i === shown.length - 1, pt: p.partial }" :title="p.label + ': ' + fmt(p.value) + (p.partial ? ' (part of the period)' : '')">
        <span class="v">{{ p.value == null ? '' : fmt(p.value) }}</span>
        <span class="bw"><span class="b" :style="{ height: (p.value == null ? 0 : Math.max(2, Math.abs(p.value) / top * 100)) + '%' }" /></span>
        <em>{{ p.label }}</em>
      </div>
    </div>
    <p v-else class="none">Nothing reported yet.</p>
  </div>
</template>
<style scoped>
.pb { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.hh { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; } .hh h3 { margin: 0; font-size: 15px; } .sb { font-size: 12px; color: var(--c-muted); }
.hh b { font-family: var(--font-heading); font-size: 22px; font-weight: 500; color: var(--c-navy); letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.bars { display: grid; gap: 10px; height: 168px; align-items: end; }
.col { display: flex; flex-direction: column; align-items: center; gap: 5px; height: 100%; min-width: 0; }
.v { font-size: 11px; color: var(--c-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.bw { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.b { width: 60%; max-width: 34px; background: #b9d3ea; }
.cur .b { background: var(--c-navy); } .cur .v { color: var(--c-navy); font-weight: 600; } .pt .b { opacity: .5; }
.col em { font-style: normal; font-size: 11.5px; color: var(--c-muted); white-space: nowrap; } .cur em { color: var(--c-navy); font-weight: 600; }
.none { margin: 0; font-size: 13px; color: var(--c-muted); }
</style>
