<script setup lang="ts">
// A thin donut with flat segments: title and total on the left, legend with shares, ring on the right.
const props = withDefaults(defineProps<{ title: string; segments: { label: string; value: number }[]; currency?: string; totalLabel?: string; max?: number }>(), { currency: '', totalLabel: 'Total', max: 8 })
const PALETTE = ['#5b7fe6', '#4fb394', '#a99af2', '#a3a3a8', '#79cdb8', '#8b2ff0', '#111111', '#1c547d', '#e6b34a', '#e5e5ea']
const rows = computed(() => {
  const s = props.segments.filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
  if (s.length <= props.max) return s
  const head = s.slice(0, props.max - 1)
  return [...head, { label: 'Others', value: s.slice(props.max - 1).reduce((t, x) => t + x.value, 0) }]
})
const total = computed(() => rows.value.reduce((t, x) => t + x.value, 0))
const sym: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const fmt = (v: number) => props.currency ? (sym[props.currency] ?? props.currency + ' ') + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toLocaleString('en-US')
const R = 70, C = 2 * Math.PI * R, GAP = rows.value.length > 1 ? 3 : 0
const arcs = computed(() => {
  let off = 0
  return rows.value.map((x, i) => {
    const len = total.value ? (x.value / total.value) * C : 0
    const a = { color: PALETTE[i % PALETTE.length], dash: Math.max(0, len - GAP) + ' ' + (C - Math.max(0, len - GAP)), offset: -off, label: x.label, value: x.value }
    off += len
    return a
  })
})
const hover = ref(-1)
</script>

<template>
  <div class="dnw"><div class="dn">
    <div class="side">
      <h3>{{ title }}</h3>
      <p class="tot">{{ totalLabel }}: <b>{{ fmt(total) }}</b></p>
      <ul v-if="rows.length" class="lg">
        <li v-for="(r, i) in rows" :key="r.label" :class="{ on: hover === i }" @mouseenter="hover = i" @mouseleave="hover = -1">
          <i :style="{ background: PALETTE[i % PALETTE.length] }" /><span>{{ r.label }}</span><em>{{ total ? Math.round((r.value / total) * 100) : 0 }}%</em><b>{{ fmt(r.value) }}</b>
        </li>
      </ul>
      <p v-else class="none">Nothing to show yet.</p>
    </div>
    <svg viewBox="0 0 180 180" class="ring" role="img" :aria-label="title + ': ' + rows.map((r) => r.label + ' ' + fmt(r.value)).join(', ')">
      <circle cx="90" cy="90" :r="R" fill="none" stroke="#eeeef1" stroke-width="16" />
      <circle v-for="(a, i) in arcs" :key="i" cx="90" cy="90" :r="R" fill="none" :stroke="a.color" :stroke-width="hover === i ? 20 : 16" :stroke-dasharray="a.dash" :stroke-dashoffset="a.offset"
        transform="rotate(-90 90 90)" class="seg" @mouseenter="hover = i" @mouseleave="hover = -1"><title>{{ a.label }}: {{ fmt(a.value) }}</title></circle>
      <text v-if="hover >= 0 && arcs[hover]" x="90" y="86" text-anchor="middle" class="cl">{{ arcs[hover]!.label.length > 16 ? arcs[hover]!.label.slice(0, 15) + '…' : arcs[hover]!.label }}</text>
      <text v-if="hover >= 0 && arcs[hover]" x="90" y="106" text-anchor="middle" class="cv">{{ total ? Math.round((arcs[hover]!.value / total) * 100) : 0 }}%</text>
    </svg>
  </div></div>
</template>

<style scoped>
.dnw { container-type: inline-size; } .dn { display: flex; gap: 18px; align-items: center; justify-content: space-between; }
.side { flex: 1; min-width: 0; } .side h3 { margin: 0 0 4px; } .tot { margin: 0 0 12px; font-size: 14px; color: var(--c-ink-soft); } .tot b { font-weight: 600; color: var(--c-ink); font-variant-numeric: tabular-nums; }
.lg { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; } .lg li { display: grid; grid-template-columns: 10px 1fr auto auto; gap: 8px; align-items: center; font-size: 13px; padding: 2px 0; cursor: default; }
.lg li i { width: 10px; height: 10px; } .lg li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-ink); } .lg li em { font-style: normal; color: var(--c-muted); font-size: 12px; }
.lg li b { font-weight: 500; font-variant-numeric: tabular-nums; } .lg li.on span { color: var(--c-blue-deep); }
.ring { width: 170px; height: 170px; flex: none; } .seg { transition: stroke-width .12s; cursor: pointer; }
.cl { font-size: 11px; fill: var(--c-muted); } .cv { font-family: var(--font-heading); font-size: 20px; fill: var(--c-navy); }
.none { color: var(--c-muted); font-size: 13px; margin: 0; }
@container (max-width: 440px) { .dn { flex-direction: column-reverse; align-items: stretch; gap: 10px; } .ring { align-self: center; width: 150px; height: 150px; } }
</style>
