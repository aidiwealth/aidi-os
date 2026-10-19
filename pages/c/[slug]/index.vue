<script setup lang="ts">
import BoardViewT from '~/components/BoardView.vue'
// A company's public investor page (also at /<handle>): NDA gate when required, branded.
definePageMeta({ layout: 'public' })
const route = useRoute()
const slug = String(route.params.slug ?? route.params.handle ?? '')
interface CtGroups { fd: number; groups: { label: string; shares: number; pct: number }[]; convertibles: { count: number; total: number; currency: string } }
interface D { sectors?: { as_of: string; sectors: { sector: string; share: number; customers: number }[] } | null; forecast?: { name: string; assumptions: import('~/shared/forecast').Assumptions; updated_at: string } | null; captable?: { name: string; detail: 'summary' | 'holders'; data?: import('~/shared/captable').Data; groups?: CtGroups } | null; room_url?: string | null; board?: { name: string; data: InstanceType<typeof BoardViewT>['$props']['data']; metrics: Record<string, { label: string; unit: string }> } | null; logo?: string | null; cover?: string | null; gated: boolean; nda: { required: boolean; text: string; key: string } | null; updates: { id: string; title: string; published_at: string }[]; company: string; headline: string | null; about: string | null; website: string | null; deck_url: string | null; contact_email: string | null; period_type: string; currency: string; metrics: { key: string; label: string; points: { period: string; value: number | null }[] }[] }
const nda = ref(String(useRoute().query.nda ?? ''))
const goNda = (id: string) => { const u = new URL(window.location.href); u.searchParams.set('nda', id); window.location.replace(u.toString()) }
const { data, error, refresh } = await useFetch<D>(() => '/api/public/c/' + slug + (nda.value ? '?nda=' + encodeURIComponent(nda.value) : ''), { key: 'pub-c-' + slug + (nda.value ? '-' + nda.value : '') })
onMounted(() => { const k = data.value?.nda?.key; if (data.value?.gated && k) { const s = localStorage.getItem('finvry-nda-' + k); if (s && s !== nda.value) goNda(s) } })
function signed(id: string) { goNda(id) }
useHead({ titleTemplate: '%s', title: () => (data.value ? data.value.company + ' · Investor relations' : 'Investor relations'), meta: [{ name: 'description', content: () => data.value?.headline ?? '' }] })
// Link previews (WhatsApp, LinkedIn, X, iMessage…): the company's logo, or the Finvry card when it has none.
const pageUrl = useRequestURL()
const ogImage = computed(() => (data.value as { og_image?: string | null } | null)?.og_image || pageUrl.origin + '/brand/finvry-og.png')
const ogTitle = computed(() => (data.value ? data.value.company + ' · Investor relations' : 'Investor relations'))
const ogDesc = computed(() => data.value?.headline || (data.value ? 'Investor information for ' + data.value.company + ', on Finvry.' : 'Investor relations on Finvry.'))
useSeoMeta({ ogType: 'website', ogSiteName: 'Finvry', ogTitle, ogDescription: ogDesc, ogUrl: pageUrl.origin + pageUrl.pathname, ogImage, ogImageAlt: () => ((data.value as { og_image?: string | null } | null)?.og_image ? data.value!.company + ' logo' : 'Finvry'), twitterCard: () => ((data.value as { og_image?: string | null } | null)?.og_image ? 'summary' : 'summary_large_image'), twitterTitle: ogTitle, twitterDescription: ogDesc, twitterImage: ogImage })
const SYM: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' }
// Each metric's unit: money, a percentage (margins, retention), months (runway) or a plain count (customers, KPIs).
const unit = (k: string) => (data.value?.metrics.find((m) => m.key === k) as { unit?: string } | undefined)?.unit ?? (k === 'gross_margin' ? 'pct' : k === 'runway' ? 'months' : 'money')
const pct = (k: string) => unit(k) === 'pct'
const fmt = (k: string, v: number | null | undefined) => v == null ? (k === 'runway' ? 'Cash-flow positive' : '—') : pct(k) ? v + '%' : unit(k) === 'months' ? v + ' months' : unit(k) === 'number' ? Math.round(v).toLocaleString('en-US') : (SYM[data.value?.currency ?? 'USD'] ?? '') + Math.round(v).toLocaleString('en-US')
const last = (m: D['metrics'][number]) => { if (m.key === 'runway') return { cur: m.points[m.points.length - 1], prev: undefined }; const p = m.points.filter((x) => x.value !== null); return { cur: p[p.length - 1], prev: p[p.length - 2] } }
const chg = (m: D['metrics'][number]) => { const { cur, prev } = last(m); return cur && prev && prev.value ? Math.round(((cur.value! - prev.value) / Math.abs(prev.value)) * 1000) / 10 : null }
const lbl = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', data.value?.period_type === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const updLink = (id: string) => '/c/' + slug + '/updates/' + id + (nda.value ? '?nda=' + nda.value : '')
</script>
<template>
  <section class="wrap">
    <div v-if="error" class="card nf"><h1>This page does not exist</h1><p>The link may be mistyped, or the page was taken down.</p><NuxtLink to="/" class="btn">Go to your dashboard</NuxtLink></div>
    <NdaGate v-else-if="data && data.gated && data.nda" :company="data.company" :text="data.nda.text" kind="page" :ref-key="slug" :org-key="data.nda.key" @signed="signed" />
    <template v-else-if="data">
      <div v-if="data.cover" class="covr"><img :src="data.cover" alt=""></div>
      <header class="hero"><img v-if="data.logo" :src="data.logo" :alt="data.company" class="clogo"><p class="label">Investor relations</p><h1>{{ data.company }}</h1><p v-if="data.headline" class="hl">{{ data.headline }}</p>
        <div class="links"><a v-if="data.deck_url" :href="webUrl(data.deck_url)" target="_blank" rel="noopener" class="btn">View our deck</a><a v-if="data.room_url" :href="webUrl(data.room_url)" target="_blank" rel="noopener" class="btn secondary">Open data room</a><a v-if="data.website" :href="webUrl(data.website)" target="_blank" rel="noopener" class="btn secondary">Website</a><a v-if="data.contact_email" :href="'mailto:' + data.contact_email" class="btn secondary">Contact us</a></div></header>
      <FinSummary :fin="(data as any).financials" class="pfs" />
      <BoardView v-if="data.board" :data="data.board.data" :metrics="data.board.metrics" class="pboard" />
      <template v-else>
      <div class="cards"><div v-for="m in data.metrics" :key="m.key" class="card k"><span class="l">{{ m.label }}</span><b>{{ fmt(m.key, last(m).cur?.value) }}</b><span class="s" :class="{ up: (chg(m) ?? 0) > 0, dn: (chg(m) ?? 0) < 0 }">{{ chg(m) == null ? (last(m).cur ? lbl(last(m).cur!.period) : 'Not reported yet') : (chg(m)! > 0 ? '+' : '') + chg(m) + '% vs previous' }}</span></div></div>
      <div class="charts"><TrendChart v-for="m in data.metrics.filter((x) => x.points.filter((p) => p.value !== null).length > 1)" :key="m.key" :title="m.label" :unit="unit(m.key) === 'money' ? 'usd' : 'count'" :symbol="SYM[data.currency] ?? data.currency + ' '"
        :points="m.points.filter((p) => p.value !== null).map((p) => ({ label: lbl(p.period), value: p.value as number }))" :foot="data.period_type === 'month' ? 'Monthly' : data.period_type === 'quarter' ? 'Quarterly' : 'Yearly'" /></div>
      </template>
      <div v-if="data.sectors?.sectors.length" class="psec"><h2>Revenue by customer sector</h2><p class="pm">Share of revenue over the last 12 months.</p><div class="secs"><div v-for="x in data.sectors.sectors" :key="x.sector" class="sr"><span>{{ x.sector }}</span><i><em :style="{ width: Math.max(2, (x.share / Math.max(...data.sectors.sectors.map((y) => y.share))) * 100) + '%' }" /></i><b>{{ x.share }}%</b></div></div></div>
      <div v-if="data.forecast" class="psec"><h2>Forecast</h2><p class="pm">{{ data.forecast.name }} · updated {{ new Date(data.forecast.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }}. An estimate from the company's assumptions, not a promise of results.</p><ForecastSummary :assumptions="data.forecast.assumptions" compact /></div>
      <div v-if="data.captable" class="psec"><h2>Ownership</h2>
        <CapTableSummary v-if="data.captable.detail === 'holders' && data.captable.data" :data="data.captable.data" />
        <div v-else-if="data.captable.groups" class="og"><div class="card pad0"><table class="ot" data-nosearch><thead><tr><th>Group</th><th class="r">Shares (fully diluted)</th><th class="r">%</th></tr></thead><tbody><tr v-for="g in data.captable.groups.groups" :key="g.label"><td>{{ g.label }}</td><td class="r">{{ Math.round(g.shares).toLocaleString('en-US') }}</td><td class="r">{{ g.pct.toFixed(2) }}%</td></tr><tr class="tot"><td>Total</td><td class="r">{{ Math.round(data.captable.groups.fd).toLocaleString('en-US') }}</td><td class="r">100%</td></tr></tbody></table>
          <p v-if="data.captable.groups.convertibles.count" class="pm pad">Plus {{ data.captable.groups.convertibles.count }} SAFE{{ data.captable.groups.convertibles.count === 1 ? '' : 's' }} or note{{ data.captable.groups.convertibles.count === 1 ? '' : 's' }} totalling {{ briefMoney(data.captable.groups.convertibles.total, data.captable.groups.convertibles.currency) }}, which convert at the next priced round.</p></div>
          <div class="card"><DonutChart title="Fully diluted ownership" total-label="Shares" :segments="data.captable.groups.groups.map((g) => ({ label: g.label, value: g.shares }))" /></div></div></div>
      <div v-if="data.updates.length" class="card ups"><h2>Updates</h2><NuxtLink v-for="u in data.updates" :key="u.id" :to="updLink(u.id)" class="up"><span>{{ u.title }}</span><em>{{ new Date(u.published_at + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }}</em></NuxtLink></div>
      <div v-if="data.about" class="card about"><h2>About {{ data.company }}</h2><div class="md" v-html="renderMarkdown(data.about)" /></div>
      <p class="fine">Figures are reported by {{ data.company }} and are unaudited unless stated.</p>
    </template>
  </section>
</template>
<style scoped>
.wrap { max-width: 1080px; margin: 0 auto; } .hero { padding: 10px 0 22px; border-bottom: 1px solid var(--c-rule); margin-bottom: 20px; } .hero h1 { font-size: 46px; margin: 4px 0; color: inherit; } .hl { font-size: 18px; opacity: .8; margin: 0 0 16px; max-width: 760px; }
.psec { margin: 8px 0 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; } .psec h2 { margin: 6px 0 0; } .pm { margin: 0; color: var(--c-muted); font-size: 13px; } .pm.pad { padding: 10px 14px; }
.og { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; align-items: start; } .pad0 { padding: 0; overflow-x: auto; } .ot { width: 100%; border-collapse: collapse; font-size: 14px; } .ot th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } .ot td { padding: 10px 14px; border-bottom: 1px solid var(--c-rule); font-variant-numeric: tabular-nums; } .ot .r { text-align: right; } .ot .tot td { font-weight: 600; }
@media (max-width: 760px) { .og { grid-template-columns: 1fr; } }
.links { display: flex; gap: 8px; flex-wrap: wrap; } .links a { text-decoration: none; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 14px; } .k { display: flex; flex-direction: column; gap: 6px; } .l { font-size: 13px; color: var(--c-muted); } .k b { font-size: 30px; font-weight: 600; } .s { font-size: 12.5px; color: var(--c-muted); } .s.up { color: var(--c-ok); } .s.dn { color: var(--c-danger); }
.charts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 14px; } .ups { margin-bottom: 14px; } .ups h2, .about h2 { margin: 0 0 8px; } .up { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--c-rule); text-decoration: none; color: var(--c-ink); } .up em { font-style: normal; color: var(--c-muted); font-size: 13px; }
.about .md { color: var(--c-ink-soft); line-height: 1.6; } .about .md :deep(h2), .about .md :deep(h3), .about .md :deep(h4) { color: var(--c-ink); margin: 22px 0 8px; } .about .md :deep(h2) { font-size: 20px; } .about .md :deep(h3) { font-size: 17px; } .about .md :deep(h4) { font-size: 15px; } .about .md :deep(table) { margin: 6px 0 18px; } .about .md :deep(p) { margin: 0 0 10px; } .about .md :deep(ul), .about .md :deep(ol) { padding-left: 20px; } .fine { font-size: 12px; opacity: .65; margin-top: 18px; }
@media (max-width: 760px) { .charts { grid-template-columns: 1fr; } .hero h1 { font-size: 34px; } }
.covr { margin: -8px 0 18px; } .covr img { width: 100%; max-height: 320px; object-fit: cover; display: block; } .clogo { width: 72px; height: 72px; object-fit: contain; background: #fff; border: 1px solid var(--c-rule); padding: 6px; margin-bottom: 12px; display: block; }
.secs { display: flex; flex-direction: column; gap: 8px; max-width: 640px; } .sr { display: grid; grid-template-columns: 180px 1fr 56px; gap: 10px; align-items: center; font-size: 14px; } .sr i { display: block; height: 10px; background: #eef1f6; } .sr em { display: block; height: 100%; background: var(--c-blue-deep, #1d64a8); } .sr b { text-align: right; font-weight: 500; }
@media (max-width: 600px) { .sr { grid-template-columns: 110px 1fr 48px; } }
.nf p { color: var(--c-muted); margin: 8px 0 16px; } .nf .btn { text-decoration: none; }
</style>
