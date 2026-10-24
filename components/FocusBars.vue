<script setup lang="ts">
// Where to focus: each customer group with its share of revenue (bar), how fast its revenue is growing, and what that
// means — protect and grow a big growing group, fix a big shrinking one, invest in a small growing one, rethink a
// small shrinking one. Easier to read than a scatter when one group carries most of the revenue.
const props = withDefaults(defineProps<{ title: string; sub?: string; items: { label: string; share: number; growth: number | null; customers: number }[] }>(), { sub: '' })
const rows = computed(() => {
  const list = [...props.items].filter((i) => i.share > 0).sort((a, b) => b.share - a.share).slice(0, 8)
  const big = 1 / Math.max(3, list.length)
  return list.map((i) => {
    const g = i.growth, isBig = i.share >= big
    const act = g == null ? { k: 'na', t: 'Too new to tell' } : isBig ? (g >= 0 ? { k: 'protect', t: 'Protect and grow' } : { k: 'fix', t: 'Fix: big but shrinking' }) : g >= 0 ? { k: 'invest', t: 'Invest: small, growing' } : { k: 'rethink', t: 'Rethink: small, shrinking' }
    return { ...i, act }
  })
})
const top = computed(() => Math.max(0.01, ...rows.value.map((r) => r.share)))
const pc = (v: number) => (Math.round(v * 1000) / 10) + '%'
const gr = (v: number | null) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 100)) + '%')
</script>

<template>
  <div class="fb card">
    <div class="fb-head"><span class="fb-title">{{ title }}</span><span class="fb-sub">{{ sub }}</span></div>
    <div v-if="rows.length" class="fb-rows">
      <div class="fb-row hd"><span>Group</span><span>Share of revenue</span><span class="r">Growth</span><span>What to do</span></div>
      <div v-for="r in rows" :key="r.label" class="fb-row">
        <span class="l" :title="r.label">{{ r.label }}<em>{{ r.customers.toLocaleString('en-US') }} paying</em></span>
        <span class="b"><i :style="{ width: Math.max(1, r.share / top * 100) + '%' }" /><b>{{ pc(r.share) }}</b></span>
        <span class="r g" :class="{ dn: (r.growth ?? 0) < 0 }">{{ gr(r.growth) }}</span>
        <span><em class="tag" :class="r.act.k">{{ r.act.t }}</em></span>
      </div>
    </div>
    <p v-else class="fb-empty">Needs customer groups with revenue.</p>
    <p class="fb-foot">Growth: last 12 months against the 12 before. Big: above an even share of revenue.</p>
  </div>
</template>

<style scoped>
.fb { padding: 16px 20px 12px; display: flex; flex-direction: column; gap: 10px; } .fb-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.fb-title { font-family: var(--font-heading); font-size: 17px; font-weight: 500; color: var(--c-navy); } .fb-sub { font-size: 12px; color: var(--c-muted); }
.fb-rows { display: flex; flex-direction: column; } .fb-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.1fr) 52px minmax(0, 1.2fr); gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--c-rule); font-size: 13px; }
.fb-row.hd { font-size: 12px; font-weight: 500; color: var(--c-muted); padding-top: 0; } .l { color: var(--c-ink-soft); } .r { text-align: right; }
.l { min-width: 0; overflow: hidden; } .l, .l em { white-space: nowrap; text-overflow: ellipsis; } .l em { display: block; font-style: normal; font-size: 11.5px; color: var(--c-muted); overflow: hidden; }
.b { display: flex; align-items: center; gap: 8px; } .b i { display: block; height: 10px; background: var(--c-navy); flex: none; max-width: 75%; } .b b { font-weight: 500; font-variant-numeric: tabular-nums; font-size: 13px; color: var(--c-ink); }
.g { font-weight: 500; color: var(--c-navy); font-variant-numeric: tabular-nums; } .g.dn { color: #b2453b; }
.tag { font-style: normal; font-size: 11.5px; padding: 2px 8px; display: inline-block; line-height: 1.35; } .tag.protect { background: #e8eef8; color: var(--c-navy); } .tag.invest { background: #eef2f8; color: #2f5ea8; } .tag.fix { background: #f8e8e6; color: #9b3b32; } .tag.rethink { background: #f3f1ec; color: #6b5a2e; } .tag.na { color: var(--c-muted); }
.fb-empty { color: var(--c-muted); font-size: 13px; } .fb-foot { margin: 0; font-size: 12px; color: var(--c-muted); }
</style>
