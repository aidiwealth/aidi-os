<script setup lang="ts">
// A company's public investor page.
definePageMeta({ layout: 'public' })
const slug = useRoute().params.slug as string
interface D { company: string; headline: string | null; about: string | null; website: string | null; deck_url: string | null; contact_email: string | null; period_type: string; currency: string; metrics: { key: string; label: string; points: { period: string; value: number | null }[] }[] }
const { data, error } = await useFetch<D>('/api/public/c/' + slug, { key: 'pub-c-' + slug })
useHead({ titleTemplate: '%s', title: () => (data.value ? data.value.company + ' · Investor relations' : 'Investor relations'), meta: [{ name: 'description', content: () => data.value?.headline ?? '' }] })
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
const pct = (k: string) => k === 'gross_margin'
const fmt = (k: string, v: number | null | undefined) => v == null ? (k === 'runway' ? 'Cash-flow positive' : '—') : pct(k) ? v + '%' : k === 'runway' ? v + ' months' : (SYM[data.value!.currency] ?? data.value!.currency + ' ') + Math.round(v).toLocaleString('en-US')
const last = (m: D['metrics'][number]) => { if (m.key === 'runway') return { cur: m.points[m.points.length - 1], prev: undefined }; const p = m.points.filter((x) => x.value !== null); return { cur: p[p.length - 1], prev: p[p.length - 2] } }
const chg = (m: D['metrics'][number]) => { const { cur, prev } = last(m); return cur && prev && prev.value ? Math.round(((cur.value! - prev.value) / Math.abs(prev.value)) * 1000) / 10 : null }
const lbl = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', data.value?.period_type === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
</script>
<template>
  <section class="wrap">
    <div v-if="error" class="card"><h1>This page does not exist</h1></div>
    <template v-else-if="data">
      <header class="hero"><p class="label">Investor relations</p><h1>{{ data.company }}</h1><p v-if="data.headline" class="hl">{{ data.headline }}</p>
        <div class="links"><a v-if="data.deck_url" :href="data.deck_url" target="_blank" rel="noopener" class="btn">View our deck</a><a v-if="data.website" :href="data.website" target="_blank" rel="noopener" class="btn secondary">Website</a><a v-if="data.contact_email" :href="'mailto:' + data.contact_email" class="btn secondary">Contact us</a></div></header>
      <div class="cards"><div v-for="m in data.metrics" :key="m.key" class="card k"><span class="l">{{ m.label }}</span><b>{{ fmt(m.key, last(m).cur?.value) }}</b><span class="s" :class="{ up: (chg(m) ?? 0) > 0, dn: (chg(m) ?? 0) < 0 }">{{ chg(m) == null ? (last(m).cur ? lbl(last(m).cur!.period) : 'Not reported yet') : (chg(m)! > 0 ? '+' : '') + chg(m) + '% vs previous' }}</span></div></div>
      <div class="charts"><TrendChart v-for="m in data.metrics.filter((x) => x.points.filter((p) => p.value !== null).length > 1)" :key="m.key" :title="m.label" :unit="pct(m.key) || m.key === 'runway' ? 'count' : 'usd'" :symbol="SYM[data.currency] ?? data.currency + ' '"
        :points="m.points.filter((p) => p.value !== null).map((p) => ({ label: lbl(p.period), value: p.value as number }))" :foot="data.period_type === 'month' ? 'Monthly' : data.period_type === 'quarter' ? 'Quarterly' : 'Yearly'" /></div>
      <div v-if="data.about" class="card about"><h2>About {{ data.company }}</h2><p>{{ data.about }}</p></div>
      <p class="fine">Figures are reported by {{ data.company }} and are unaudited unless stated. Published with Finvry.</p>
    </template>
  </section>
</template>
<style scoped>
.wrap { max-width: 1080px; margin: 0 auto; } .hero { padding: 10px 0 22px; border-bottom: 1px solid var(--c-rule); margin-bottom: 20px; } .hero h1 { font-size: 46px; margin: 4px 0; } .hl { font-size: 18px; color: var(--c-ink-soft); margin: 0 0 16px; max-width: 760px; }
.links { display: flex; gap: 8px; flex-wrap: wrap; } .links a { text-decoration: none; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 14px; } .k { display: flex; flex-direction: column; gap: 6px; } .l { font-size: 13px; color: var(--c-muted); } .k b { font-size: 30px; font-weight: 600; } .s { font-size: 12.5px; color: var(--c-muted); } .s.up { color: var(--c-ok); } .s.dn { color: var(--c-danger); }
.charts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 14px; } .about h2 { margin: 0 0 8px; } .about p { white-space: pre-line; color: var(--c-ink-soft); line-height: 1.6; margin: 0; } .fine { font-size: 12px; color: var(--c-muted); margin-top: 18px; }
@media (max-width: 760px) { .charts { grid-template-columns: 1fr; } .hero h1 { font-size: 34px; } }
</style>
