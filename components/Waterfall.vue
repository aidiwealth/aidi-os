<script setup lang="ts">
// Where a figure went over a period: the start, each step up or down, and the end, as floating bars.
const props = withDefaults(defineProps<{ title: string; sub?: string; start: { label: string; value: number }; steps: { label: string; value: number }[]; endLabel: string; currency?: string; foot?: string; noChange?: boolean }>(), { sub: '', currency: 'USD', foot: '', noChange: false })
const W = 560, H = 190, PAD = 18
const bars = computed(() => {
  let run = props.start.value
  const out = [{ label: props.start.label, from: 0, to: run, kind: 'total', v: run }]
  for (const s of props.steps) { out.push({ label: s.label, from: run, to: run + s.value, kind: s.value >= 0 ? 'up' : 'down', v: s.value }); run += s.value }
  out.push({ label: props.endLabel, from: 0, to: run, kind: 'total', v: run })
  return out
})
const hi = computed(() => Math.max(1, ...bars.value.map((b) => Math.max(b.from, b.to))))
const y = (v: number) => PAD + (1 - v / hi.value) * (H - PAD * 2)
const slot = computed(() => W / bars.value.length), bw = computed(() => Math.min(56, slot.value * 0.62))
const fmt = (v: number) => (v < 0 ? '−' : v > 0 ? '' : '') + briefMoney(Math.abs(v), props.currency)
const change = computed(() => { if (props.noChange) return null; const a = props.start.value, b = bars.value[bars.value.length - 1]!.to; return a ? (b / a - 1) * 100 : null })
</script>

<template>
  <div class="wf card">
    <div class="wf-head"><span class="wf-title">{{ title }}</span><span class="wf-sub">{{ sub }}{{ change != null ? (sub ? ' · ' : '') + (change >= 0 ? '+' : '−') + Math.abs(Math.round(change * 10) / 10) + '%' : '' }}</span></div>
    <svg :viewBox="'0 0 ' + W + ' ' + (H + 34)" role="img" :aria-label="title">
      <g v-for="(b, i) in bars" :key="b.label">
        <rect :x="(i + 0.5) * slot - bw / 2" :y="y(Math.max(b.from, b.to))" :width="bw" :height="Math.max(1.5, Math.abs(y(b.from) - y(b.to)))" :class="b.kind" />
        <line v-if="i < bars.length - 1" :x1="(i + 0.5) * slot + bw / 2" :x2="(i + 1.5) * slot - bw / 2" :y1="y(b.to)" :y2="y(b.to)" class="cn" />
        <text :x="(i + 0.5) * slot" :y="y(Math.max(b.from, b.to)) - 5" text-anchor="middle" class="v">{{ b.kind === 'total' ? briefMoney(b.v, currency) : (b.v >= 0 ? '+' : '') + fmt(b.v) }}</text>
        <text :x="(i + 0.5) * slot" :y="H + 14" text-anchor="middle" class="l">{{ b.label }}</text>
      </g>
    </svg>
    <div v-if="foot" class="wf-foot">{{ foot }}</div>
  </div>
</template>

<style scoped>
.wf { padding: 16px 20px 12px; display: flex; flex-direction: column; gap: 8px; }
.wf-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; } .wf-title { font-family: var(--font-heading); font-size: 17px; font-weight: 500; color: var(--c-navy); } .wf-sub { font-size: 12px; color: var(--c-muted); }
svg { width: 100%; height: auto; display: block; } rect.total { fill: var(--c-navy); } rect.up { fill: #3d6bb3; } rect.down { fill: #b2453b; } .cn { stroke: var(--c-rule-strong); stroke-dasharray: 2 2; }
text.v { font-size: 11px; fill: var(--c-ink); font-variant-numeric: tabular-nums; } text.l { font-size: 11px; fill: var(--c-muted); }
.wf-foot { font-size: 12.5px; color: var(--c-muted); border-top: 1px solid var(--c-rule); padding-top: 8px; }
</style>
