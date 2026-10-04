<script setup lang="ts">
// Money in and money out for a month, with the average of the three months before it. Month arrows step through history.
const props = defineProps<{ rows: { date: string; amount: number | string }[]; currency: string }>()
const months = computed(() => [...new Set(props.rows.map((r) => r.date.slice(0, 7)))].sort())
const idx = ref(-1)
watchEffect(() => { if (idx.value < 0 || idx.value >= months.value.length) idx.value = months.value.length - 1 })
const cur = computed(() => months.value[idx.value] ?? new Date().toISOString().slice(0, 7))
const sum = (m: string, dir: 1 | -1) => props.rows.filter((r) => r.date.startsWith(m) && Math.sign(Number(r.amount)) === dir).reduce((t, r) => t + Math.abs(Number(r.amount)), 0)
const count = (m: string, dir: 1 | -1) => props.rows.filter((r) => r.date.startsWith(m) && Math.sign(Number(r.amount)) === dir).length
const prev3 = computed(() => { const out: string[] = []; const d = new Date(cur.value + '-01T00:00:00Z'); for (let i = 1; i <= 3; i++) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7)); return out })
const avg = (dir: 1 | -1) => prev3.value.reduce((t, m) => t + sum(m, dir), 0) / 3
const label = computed(() => new Date(cur.value + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }))
</script>
<template>
  <div class="mf">
    <div class="mh"><h2>Money movement</h2><div class="nav"><button type="button" :disabled="idx <= 0" aria-label="Previous month" @click="idx--">‹</button><span>{{ label }}</span><button type="button" :disabled="idx >= months.length - 1" aria-label="Next month" @click="idx++">›</button></div></div>
    <div class="cards">
      <div class="c"><span class="l">Money in</span><b class="in"><Money :value="sum(cur, 1)" :currency="currency" /></b>
        <div class="r"><span>{{ count(cur, 1) ? count(cur, 1) + ' incoming payment' + (count(cur, 1) === 1 ? '' : 's') : 'No incoming funds' }}</span></div>
        <div class="r"><span>Last 3 months average</span><Money :value="avg(1)" :currency="currency" muted /></div></div>
      <div class="c"><span class="l">Money out</span><b><Money :value="sum(cur, -1)" :currency="currency" /></b>
        <div class="r"><span>{{ count(cur, -1) ? count(cur, -1) + ' payment' + (count(cur, -1) === 1 ? '' : 's') + ' and fees' : 'No outgoing payments' }}</span></div>
        <div class="r"><span>Last 3 months average</span><Money :value="avg(-1)" :currency="currency" muted /></div></div>
    </div>
  </div>
</template>
<style scoped>
.mh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; } .mh h2 { margin: 0; }
.nav { display: flex; align-items: center; gap: 14px; font-size: 15px; } .nav button { width: 34px; height: 34px; background: #fff; border: 1px solid var(--c-rule); font-size: 18px; cursor: pointer; color: var(--c-ink); } .nav button:disabled { opacity: .35; cursor: default; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .c { background: #fff; border: 1px solid var(--c-rule); display: flex; flex-direction: column; }
.l { padding: 18px 22px 0; font-size: 14px; color: var(--c-ink-soft); } .c > b { padding: 10px 22px 22px; font-size: 38px; font-weight: 600; letter-spacing: -0.02em; color: var(--c-ink); } .c > b.in { color: var(--c-ok); }
.r { display: flex; justify-content: space-between; gap: 10px; padding: 14px 22px; border-top: 1px solid var(--c-rule); font-size: 14px; color: var(--c-ink-soft); }
@media (max-width: 800px) { .cards { grid-template-columns: 1fr; } }
</style>
