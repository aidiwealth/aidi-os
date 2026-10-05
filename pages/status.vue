<script setup lang="ts">
// Public status page.
definePageMeta({ layout: false })
interface C { key: string; label: string; ok: boolean; note: string | null; latency_ms: number | null; uptime: number | null; days: { day: string; ok: number; total: number }[] }
const { data, refresh } = await useFetch<{ checked_at: string; components: C[]; incidents: { component: string; started: string; last: string; checks: number }[] }>('/api/public/status')
const brand = useBrand()
useHead({ title: 'Status — ' + brand.name })
const days = computed(() => Array.from({ length: 90 }, (_, i) => { const d = new Date(Date.now() - (89 - i) * 86400e3); return d.toISOString().slice(0, 10) }))
const cell = (c: C, d: string) => { const x = c.days.find((y) => y.day === d); return !x ? 'none' : x.ok === x.total ? 'up' : x.ok / x.total >= 0.9 ? 'part' : 'down' }
const core = computed(() => (data.value?.components ?? []).filter((c) => ['app', 'api', 'database'].includes(c.key)))
const allOk = computed(() => core.value.every((c) => c.ok))
onMounted(() => { const t = setInterval(() => refresh(), 60000); onBeforeUnmount(() => clearInterval(t)) })
</script>
<template>
  <div class="st"><header><span class="brand">{{ brand.name }}</span><span class="tag">Status</span></header>
    <main v-if="data">
      <div class="hero" :class="allOk ? 'ok' : 'bad'"><span class="dot" /><div><h1>{{ allOk ? 'All systems operational' : 'Some systems are having problems' }}</h1><p>Last checked {{ new Date(data.checked_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }} · refreshes every minute</p></div></div>
      <div class="list"><div v-for="c in data.components" :key="c.key" class="comp"><div class="ch"><b>{{ c.label }}</b><span :class="c.ok ? 'g' : c.note === 'Not yet available' || c.note === 'Not configured' ? 'm' : 'r'">{{ c.ok ? 'Operational' : c.note ?? 'Degraded' }}</span></div>
        <div class="bars"><i v-for="d in days" :key="d" :class="cell(c, d)" :title="d" /></div>
        <div class="cf"><span>90 days ago</span><span>{{ c.uptime !== null ? c.uptime + '% uptime' : 'Collecting data' }}{{ c.latency_ms !== null ? ' · ' + c.latency_ms + ' ms' : '' }}</span><span>Today</span></div></div></div>
      <section class="inc"><h2>Recent incidents</h2><p v-if="!data.incidents.length" class="mut">No incidents in the last 14 days.</p>
        <div v-for="(i, k) in data.incidents" :key="k" class="ii"><b>{{ data.components.find((c) => c.key === i.component)?.label }} unavailable</b><span>{{ new Date(i.started).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }} – {{ new Date(i.last).toLocaleTimeString('en-GB', { timeStyle: 'short' }) }}</span></div></section>
    </main>
    <footer><a href="/developers">API reference</a><span>© {{ new Date().getFullYear() }} {{ brand.name }}</span></footer>
  </div>
</template>
<style scoped>
.st { min-height: 100vh; background: #f7f6f2; font-family: var(--font-body); color: var(--c-ink); } header { display: flex; align-items: center; gap: 10px; max-width: 860px; margin: 0 auto; padding: 28px 20px 0; } .brand { font-weight: 700; font-size: 20px; letter-spacing: -.02em; } .tag { font-size: 13px; color: var(--c-muted); border-left: 1px solid var(--c-rule-strong); padding-left: 10px; }
main { max-width: 860px; margin: 0 auto; padding: 22px 20px; } .hero { display: flex; gap: 14px; align-items: center; padding: 20px 22px; color: #fff; } .hero.ok { background: #1f7a4d; } .hero.bad { background: #b42318; } .hero h1 { margin: 0; color: #fff; font-size: 22px; } .hero p { margin: 2px 0 0; font-size: 13px; opacity: .85; } .dot { width: 14px; height: 14px; border-radius: 50%; background: #fff; flex: none; }
.list { background: #fff; border: 1px solid var(--c-rule); margin-top: 18px; } .comp { padding: 16px 20px; border-bottom: 1px solid var(--c-rule); } .comp:last-child { border-bottom: 0; } .ch { display: flex; justify-content: space-between; font-size: 14.5px; } .ch span { font-size: 13px; } .g { color: #1f7a4d; } .r { color: #b42318; } .m { color: var(--c-muted); }
.bars { display: grid; grid-template-columns: repeat(90, 1fr); gap: 2px; margin: 10px 0 6px; height: 28px; } .bars i { display: block; border-radius: 1px; } .up { background: #2f9e6a; } .part { background: #e3a008; } .down { background: #d64545; } .none { background: #e4e2dc; }
.cf { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--c-muted); } .inc { margin-top: 22px; } .inc h2 { font-size: 16px; margin: 0 0 8px; } .ii { display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .ii span, .mut { color: var(--c-muted); font-size: 13px; }
footer { max-width: 860px; margin: 0 auto; padding: 10px 20px 40px; display: flex; justify-content: space-between; font-size: 12.5px; color: var(--c-muted); } footer a { color: var(--c-blue-deep); }
</style>
