<script setup lang="ts">
// Horizontal bars, one per row (a customer group, a customer), with an optional reference line (e.g. 100% net
// revenue retention, where customers neither grew nor shrank).
const props = withDefaults(defineProps<{ title: string; sub?: string; rows: { label: string; value: number | null; note?: string }[]; unit?: 'pct' | 'money'; currency?: string; refLine?: number | null; refLabel?: string; max?: number }>(), { sub: '', unit: 'pct', currency: 'USD', refLine: null, refLabel: '', max: 10 })
const shown = computed(() => props.rows.filter((r) => r.value !== null).slice(0, props.max))
const top = computed(() => Math.max(props.refLine ?? 0, ...shown.value.map((r) => r.value ?? 0)) * 1.08 || 1)
const w = (v: number) => Math.max(0.5, Math.min(100, (v / top.value) * 100)) + '%'
const fmt = (v: number) => (props.unit === 'money' ? briefMoney(v, props.currency) : Math.round(v * 10) / 10 + '%')
</script>

<template>
  <div class="hb card">
    <div class="hb-head"><span class="hb-title">{{ title }}</span><span class="hb-sub">{{ sub }}</span></div>
    <div v-if="shown.length" class="hb-rows">
      <div v-for="r in shown" :key="r.label" class="hb-row">
        <span class="hb-l" :title="r.label">{{ r.label }}<em v-if="r.note">{{ r.note }}</em></span>
        <span class="hb-t"><i :class="{ below: refLine != null && (r.value ?? 0) < refLine }" :style="{ width: w(r.value ?? 0) }" /><u v-if="refLine != null" :style="{ left: w(refLine) }" /></span>
        <b>{{ fmt(r.value ?? 0) }}</b>
      </div>
    </div>
    <div v-else class="hb-empty">Not enough data yet</div>
    <div v-if="refLine != null && refLabel" class="hb-foot"><u class="k" /> {{ refLabel }}</div>
  </div>
</template>

<style scoped>
.hb { padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.hb-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; } .hb-title { font-family: var(--font-heading); font-size: 17px; font-weight: 500; color: var(--c-navy); } .hb-sub { font-size: 12px; color: var(--c-muted); }
.hb-rows { display: flex; flex-direction: column; gap: 8px; } .hb-row { display: grid; grid-template-columns: minmax(0, 170px) 1fr 64px; gap: 10px; align-items: center; font-size: 13px; }
.hb-l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; } .hb-l em { display: block; font-style: normal; color: var(--c-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.hb-t { position: relative; height: 12px; background: var(--c-paper-2, #f4f6fa); } .hb-t i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c-navy); } .hb-t i.below { background: #b2453b; }
.hb-t u { position: absolute; top: -3px; bottom: -3px; width: 0; border-left: 1px dashed var(--c-ink-soft); text-decoration: none; }
.hb-row b { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; } .hb-empty { color: var(--c-muted); font-size: 13px; padding: 20px 0; }
.hb-foot { font-size: 12px; color: var(--c-muted); display: flex; align-items: center; gap: 6px; } .hb-foot .k { display: inline-block; width: 0; height: 12px; border-left: 1px dashed var(--c-ink-soft); text-decoration: none; }
</style>
