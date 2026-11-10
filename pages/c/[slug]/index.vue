<script setup lang="ts">
import BoardViewT from '~/components/BoardView.vue'
// A company's public investor page (also at /<handle>): NDA gate when required, branded.
definePageMeta({ layout: 'public' })
const route = useRoute()
const slug = String(route.params.slug ?? route.params.handle ?? '')
interface CtGroups { fd: number; groups: { label: string; shares: number; pct: number }[]; convertibles: { count: number; total: number; currency: string } }
interface D { email_gate?: boolean; forecast_group?: { currency: string; name: string; companies: import('~/shared/forecast').GroupCo[] } | null; sectors?: { as_of: string; sectors: { sector: string; share: number; customers: number }[] } | null; forecast?: { name: string; assumptions: import('~/shared/forecast').Assumptions; updated_at: string } | null; captable?: { name: string; detail: 'summary' | 'holders'; data?: import('~/shared/captable').Data; groups?: CtGroups } | null; room_url?: string | null; board?: { name: string; data: InstanceType<typeof BoardViewT>['$props']['data']; metrics: Record<string, { label: string; unit: string }> } | null; logo?: string | null; cover?: string | null; gated: boolean; nda: { required: boolean; text: string; key: string } | null; updates: { id: string; title: string; published_at: string }[]; company: string; headline: string | null; about: string | null; website: string | null; deck_url: string | null; contact_email: string | null; period_type: string; currency: string; metrics: { key: string; label: string; points: { period: string; value: number | null }[] }[] }
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
// Quarters read as Q3 '26 (Q3 2026 in headings); months as Sept 26; years as 2026.
const qtr = (d: string, long = false) => 'Q' + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1) + (long ? ' ' + d.slice(0, 4) : " '" + d.slice(2, 4))
const lbl = (d: string) => data.value?.period_type === 'quarter' ? qtr(d) : new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', data.value?.period_type === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' })
const updLink = (id: string) => '/c/' + slug + '/updates/' + id + (nda.value ? '?nda=' + nda.value : '')
// ── The simple layout ──
type Fin = { summary: { period: string; latest: string | null; currency: string; items: { label: string; value: number | null; unit: 'money' | 'pct' | 'months'; note?: string }[] } | null; sources: { name: string; url: string; synced: string | null }[] } | null
const fin = computed(() => (data.value as { financials?: Fin } | null)?.financials ?? null)
// The headline numbers: the company's financial summary, at most four.
const big = computed(() => (fin.value?.summary?.items ?? []).filter((i) => i.value != null).slice(0, 4))
const bigVal = (i: { value: number | null; unit: string }) => (i.unit === 'pct' ? i.value!.toFixed(1) + '%' : i.unit === 'months' ? (i.value! >= 36 ? '36+' : Math.round(i.value!)) + ' months' : briefMoney(i.value, fin.value?.summary?.currency ?? data.value?.currency ?? 'USD'))
// Short figures for the boxes ($469k rather than $468,766).
const short = (k: string, v: number | null | undefined) => (v == null ? fmt(k, v) : unit(k) === 'money' ? briefMoney(v, data.value?.currency ?? 'USD') : fmt(k, v))
const periodWord = computed(() => (data.value?.period_type === 'quarter' ? 'quarter' : data.value?.period_type === 'year' ? 'year' : 'month'))
const lastPeriod = computed(() => { const ps = (data.value?.metrics ?? []).flatMap((m) => m.points.filter((p) => p.value != null).map((p) => p.period)).sort(); const d = ps[ps.length - 1]; return d && data.value?.period_type === 'quarter' ? qtr(d, true) : d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', data.value?.period_type === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'long', year: 'numeric', timeZone: 'UTC' }) : (fin.value?.summary?.period ?? '') })
// One clear chart: revenue (or the first money figure), the last eight periods.
const rev = computed(() => {
  const m = data.value?.metrics.find((x) => x.key === 'revenue') ?? data.value?.metrics.find((x) => unit(x.key) === 'money' && x.key !== 'runway')
  if (!m) return null
  const pts = m.points.filter((p) => p.value != null).slice(-8)
  if (pts.length < 2) return null
  // A rounded top for the scale, so the guide lines read as plain amounts ($500k, $1M, $1.5M).
  const top = Math.max(...pts.map((p) => p.value as number), 1), step = Math.pow(10, Math.floor(Math.log10(top))), max = Math.ceil(top / (step / 2)) * (step / 2)
  const a = pts[pts.length - 1]!.value as number, b = pts[pts.length - 2]!.value as number
  // The same period a year earlier, and the last twelve months added up, from every reported period.
  const all = m.points.filter((p) => p.value != null).map((p) => p.value as number), per = data.value?.period_type === 'quarter' ? 4 : data.value?.period_type === 'year' ? 1 : 12
  const ago = all.length > per ? all[all.length - 1 - per]! : null
  const yoy = ago ? Math.round(((a - ago) / Math.abs(ago)) * 1000) / 10 : null
  const ttm = per > 1 && all.length >= per ? all.slice(-per).reduce((s, v) => s + v, 0) : null
  return { key: m.key, label: m.label, bars: pts.map((p) => ({ label: lbl(p.period), value: p.value as number, h: Math.max(1.5, ((p.value as number) / max) * 100) })), last: a, lastLabel: lbl(pts[pts.length - 1]!.period), change: b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : null, yoy, ttm, ticks: [max, max / 2] }
})
// Ownership: Finvry's blues, darkest for the largest group.
const OWN = ['#0c1a2e', '#1c547d', '#3d6e99', '#8fb3d6', '#c9d6e5', '#5d6470', '#a8b4c2']
const own = computed(() => { const g = data.value?.captable?.groups; if (!g) return null; return { fd: g.fd, conv: g.convertibles, rows: [...g.groups].sort((a, b) => b.shares - a.shares).map((x, i) => ({ ...x, color: OWN[i % OWN.length]! })) } })
// The change on the period before: percentage points for margins and other percentages, else a percentage.
function tileChg(m: D['metrics'][number]) {
  const { cur, prev } = last(m), c = chg(m)
  if (c == null || !cur) return cur ? lbl(cur.period) : 'Not reported yet'
  const arrow = c > 0 ? '↑ ' : c < 0 ? '↓ ' : ''
  if (pct(m.key) && prev?.value != null) { const d = Math.round(Math.abs(cur.value! - prev.value) * 10) / 10; return arrow + d + (d === 1 ? ' point' : ' points') + ' on last ' + periodWord.value }
  return arrow + Math.abs(c) + '% on last ' + periodWord.value
}
// A small line of each figure's history inside its box.
function spark(m: D['metrics'][number]) {
  const v = m.points.map((p) => p.value).filter((x): x is number => x != null).slice(-12)
  if (v.length < 2) return null
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1
  const pts = v.map((x, i) => [(i / (v.length - 1)) * 200, 34 - ((x - lo) / r) * 30] as const)
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ')
  return { line, area: line + ' L200 38 L0 38 Z', from: lbl(m.points.find((p) => p.value != null)!.period) }
}
// The company's own text: headings get anchors for the contents list, and amounts and percentages are picked out.
const story = computed(() => {
  if (!data.value?.about) return { html: '', toc: [] as { id: string; text: string }[] }
  let html = renderMarkdown(data.value.about), n = 0
  const heads: { tag: string; id: string; text: string }[] = []
  html = html.replace(/<(h[234])([^>]*)>([\s\S]*?)<\/\1>/g, (_m, tag: string, attrs: string, inner: string) => { const id = 's-' + ++n; heads.push({ tag, id, text: inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() }); return '<' + tag + attrs + ' id="' + id + '">' + inner + '</' + tag + '>' })
  const NUM = /([+−-]?[$₦£€]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:bn|[kKmMbB]\b|million|billion|thousand))?|[+−-]?\d[\d,]*(?:\.\d+)?\s?%)/g
  let skip = 0
  html = html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) { const t = /^<(\/?)(table|h[1-6]|a|code|pre)\b/i.exec(part); if (t) skip = Math.max(0, skip + (t[1] ? -1 : 1)); return part }
    return skip > 0 ? part : part.replace(NUM, '<span class="num">$1</span>')
  }).join('')
  const top = heads.filter((h) => h.tag === 'h2'), lvl = top.length >= 2 ? top : heads.filter((h) => h.tag === 'h3')
  return { html, toc: lvl.length >= 3 ? lvl.map(({ id, text }) => ({ id, text })) : [] }
})
// Tables in the text: the latest column of plain amounts gets a small bar in each cell, so sizes read at a glance.
const storyEl = ref<HTMLElement | null>(null), active = ref('')
function parseAmt(t: string): number | null {
  let s = t.replace(/[\s,$₦£€]/g, '').replace(/−/g, '-'); if (!s) return null
  const neg = /^\(.*\)$/.test(s); s = s.replace(/[()]/g, '')
  const m = /^(-?\d+(?:\.\d+)?)(%|k|m|b|bn)?$/i.exec(s); if (!m) return null
  const mul: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 }
  const v = Number(m[1]) * (mul[(m[2] ?? '').toLowerCase()] ?? 1)
  return neg ? -v : v
}
function decorate() {
  const root = storyEl.value; if (!root) return
  root.querySelectorAll('table').forEach((tb) => {
    if (tb.dataset.bars) return; tb.dataset.bars = '1'
    const rows = [...tb.querySelectorAll('tr')].filter((r) => r.querySelector('td'))
    if (rows.length < 3 || rows.length > 20) return
    const body = rows.filter((r) => !/^total/i.test((r.cells[0]?.textContent ?? '').trim()))
    const cols = Math.max(...rows.map((r) => r.cells.length))
    for (let c = cols - 1; c >= 1; c--) {
      const vals = body.map((r) => parseAmt(r.cells[c]?.textContent ?? ''))
      if (vals.some((v) => v == null || v < 0)) continue
      if (vals.every((v) => Number.isInteger(v) && v! >= 1900 && v! <= 2100)) continue
      const max = Math.max(...(vals as number[])); if (!max) continue
      body.forEach((r, i) => { const cell = r.cells[c]; if (!cell) return; const bar = document.createElement('i'); bar.className = 'tbar'; const fill = document.createElement('em'); fill.style.width = Math.max(2, (vals[i]! / max) * 100) + '%'; bar.appendChild(fill); cell.appendChild(bar) })
      break
    }
  })
}
let io: IntersectionObserver | null = null
function spy() {
  io?.disconnect(); const root = storyEl.value; if (!root || !story.value.toc.length) return
  io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) active.value = e.target.id }, { rootMargin: '0px 0px -70% 0px' })
  for (const t of story.value.toc) { const el = root.querySelector('#' + t.id); if (el) io.observe(el) }
}
onMounted(() => { decorate(); spy() })
watch(() => story.value.html, async () => { await nextTick(); decorate(); spy() })
onBeforeUnmount(() => io?.disconnect())
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
</script>
<template>
  <section class="wrap">
    <div v-if="error" class="card nf"><h1>This page does not exist</h1><p>The link may be mistyped, or the page was taken down.</p><NuxtLink to="/" class="btn">Go to your dashboard</NuxtLink></div>
    <PageEmailGate v-else-if="data && data.gated && data.email_gate" :slug="slug" :company="data.company" :headline="data.headline" :logo="data.logo" @done="refresh()" />
    <NdaGate v-else-if="data && data.gated && data.nda" :company="data.company" :text="data.nda.text" kind="page" :ref-key="slug" :org-key="data.nda.key" @signed="signed" />
    <div v-else-if="data" class="ir">
      <nav class="top">
        <img v-if="data.logo" :src="data.logo" :alt="data.company" class="tlogo"><b v-else class="tname">{{ data.company }}</b>
        <div class="tl"><a v-if="big.length || data.metrics.length || data.board" href="#numbers">Numbers</a><a v-if="data.about" href="#story">{{ story.toc.length ? 'Our story' : 'About' }}</a><a v-if="data.updates.length" href="#updates">Updates</a></div>
        <a v-if="data.contact_email" :href="'mailto:' + data.contact_email" class="tbtn">Contact us</a>
      </nav>

      <div v-if="data.cover" class="covr"><img :src="data.cover" alt=""></div>

      <header class="hero">
        <span class="eyebrow">{{ data.logo ? data.company + ' · ' : '' }}Investor relations{{ lastPeriod ? ' · updated ' + lastPeriod : '' }}</span>
        <h1>{{ data.headline || data.company }}</h1>
        <div class="links">
          <a v-if="data.deck_url" :href="webUrl(data.deck_url)" target="_blank" rel="noopener" class="b1">View our deck</a>
          <a v-if="data.room_url" :href="webUrl(data.room_url)" target="_blank" rel="noopener" class="b2">Open data room</a>
          <a v-if="data.website" :href="webUrl(data.website)" target="_blank" rel="noopener" class="b3">{{ data.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') }} ↗</a>
        </div>
      </header>

      <section v-if="big.length" id="numbers" class="big" :style="{ gridTemplateColumns: 'repeat(' + big.length + ', minmax(0, 1fr))' }">
        <div v-for="i in big" :key="i.label"><b :class="{ neg: (i.value ?? 0) < 0 }">{{ bigVal(i) }}</b><span>{{ i.label }}</span><em v-if="i.note">{{ i.note }}</em></div>
      </section>
      <p v-if="fin?.sources.length" class="src">Figures come from <template v-for="(x, n) in fin.sources" :key="x.url"><a :href="x.url" target="_blank" rel="noopener nofollow">{{ x.name }}</a>{{ n < fin.sources.length - 1 ? ', ' : '' }}</template>, shared by the company.</p>

      <BoardView v-if="data.board" :id="big.length ? undefined : 'numbers'" :data="data.board.data" :metrics="data.board.metrics" class="sec pboard" />
      <template v-else>
        <section v-if="rev" :id="big.length ? undefined : 'numbers'" class="sec rvp">
          <div class="rvh">
            <div class="rvm"><span class="k">{{ rev.label }} · {{ rev.lastLabel }}</span><b>{{ short(rev.key, rev.last) }}</b>
              <span v-if="rev.change != null" class="rvc"><i :class="rev.change >= 0 ? 'pos' : 'neg'">{{ rev.change >= 0 ? '↑' : '↓' }} {{ Math.abs(rev.change) }}%</i> on the {{ periodWord }} before</span></div>
            <div class="rvx">
              <div v-if="rev.yoy != null"><span>On a year ago</span><b :class="rev.yoy >= 0 ? 'pos' : 'neg'">{{ rev.yoy >= 0 ? '+' : '−' }}{{ Math.abs(rev.yoy) }}%</b></div>
              <div v-if="rev.ttm != null"><span>Last 12 months</span><b>{{ short(rev.key, rev.ttm) }}</b></div>
            </div>
          </div>
          <div class="plot">
            <div class="grid"><span v-for="t in rev.ticks" :key="t" :style="{ bottom: (t / rev.ticks[0]!) * 100 + '%' }"><em>{{ short(rev.key, t) }}</em></span></div>
            <div class="bars" :style="{ gridTemplateColumns: 'repeat(' + rev.bars.length + ', minmax(0, 1fr))' }">
              <span v-for="(x, n) in rev.bars" :key="n" :class="{ on: n === rev.bars.length - 1 }" :style="{ height: x.h + '%' }" :title="x.label + ': ' + short(rev.key, x.value)"><em>{{ short(rev.key, x.value) }}</em></span>
            </div>
          </div>
          <div class="bl" :style="{ gridTemplateColumns: 'repeat(' + rev.bars.length + ', minmax(0, 1fr))' }"><span v-for="(x, n) in rev.bars" :key="n" :class="{ on: n === rev.bars.length - 1 }">{{ x.label }}</span></div>
        </section>

        <section v-if="data.metrics.length" class="sec">
          <h2>{{ lastPeriod || 'Latest figures' }}</h2>
          <div class="tiles">
            <div v-for="m in data.metrics" :key="m.key" class="tile"><span>{{ m.label }}</span><b>{{ short(m.key, last(m).cur?.value) }}</b>
              <em :class="{ pos: (chg(m) ?? 0) > 0, neg: (chg(m) ?? 0) < 0 }">{{ tileChg(m) }}</em>
              <svg v-if="spark(m)" viewBox="0 0 200 38" preserveAspectRatio="none" class="spk" role="img" :aria-label="m.label + ' over the last ' + Math.min(12, m.points.length) + ' ' + periodWord + 's'"><path :d="spark(m)!.area" fill="#e6eef6" /><path :d="spark(m)!.line" fill="none" stroke="#1c547d" stroke-width="2" vector-effect="non-scaling-stroke" /></svg></div>
          </div>
        </section>

      </template>

      <section v-if="data.about" id="story" class="sec story" :class="{ withtoc: story.toc.length }">
        <nav v-if="story.toc.length" class="toc"><b>{{ data.company }}</b><a v-for="t in story.toc" :key="t.id" :href="'#' + t.id" :class="{ on: active === t.id }" @click.prevent="go(t.id)">{{ t.text }}</a></nav>
        <article ref="storyEl" class="md" v-html="story.html" />
      </section>

      <section v-if="data.sectors?.sectors.length" class="sec">
        <h2>Revenue by customer sector</h2><p class="pm">Share of revenue over the last 12 months.</p>
        <div class="secs"><div v-for="x in data.sectors.sectors" :key="x.sector" class="sr"><span>{{ x.sector }}</span><i><em :style="{ width: Math.max(2, (x.share / Math.max(...data.sectors.sectors.map((y) => y.share))) * 100) + '%' }" /></i><b>{{ x.share }}%</b></div></div>
      </section>
      <section v-if="data.forecast_group" class="sec"><h2>Forecast</h2><ForecastGroup :data="data.forecast_group" :can-edit="false" pub /></section>
      <section v-else-if="data.forecast" class="sec"><h2>Forecast</h2><p class="pm">{{ data.forecast.name }} · updated {{ new Date(data.forecast.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }}. An estimate from the company's assumptions, not a promise of results.</p><ForecastSummary :assumptions="data.forecast.assumptions" compact /></section>
      <section v-if="data.captable" class="sec"><h2>Ownership</h2>
        <CapTableSummary v-if="data.captable.detail === 'holders' && data.captable.data" :data="data.captable.data" />
        <div v-else-if="own" class="own">
          <div class="ownh">
            <div><b>{{ Math.round(own.fd).toLocaleString('en-US') }}</b><span>shares, fully diluted</span></div>
            <div v-if="own.conv.count" class="ownc"><b>{{ briefMoney(own.conv.total, own.conv.currency) }}</b><span>in {{ own.conv.count }} SAFE{{ own.conv.count === 1 ? '' : 's' }} or note{{ own.conv.count === 1 ? '' : 's' }}, converting at the next priced round</span></div>
          </div>
          <div class="stack" role="img" :aria-label="own.rows.map((r) => r.label + ' ' + r.pct.toFixed(1) + '%').join(', ')"><i v-for="r in own.rows" :key="r.label" :style="{ width: r.pct + '%', background: r.color }" :title="r.label + ': ' + r.pct.toFixed(2) + '%'" /></div>
          <div class="ownl">
            <div v-for="r in own.rows" :key="r.label" class="ownr"><span class="on"><i :style="{ background: r.color }" />{{ r.label }}</span><span class="os">{{ Math.round(r.shares).toLocaleString('en-US') }}</span><b>{{ r.pct.toFixed(r.pct < 1 ? 2 : 1) }}%</b></div>
          </div>
        </div>
      </section>

      <section v-if="data.deck_url || data.contact_email || data.room_url" class="sec cta">
        <div><span>Investors</span><b>Talk to {{ data.company }}</b></div>
        <div class="ctab"><a v-if="data.deck_url" :href="webUrl(data.deck_url)" target="_blank" rel="noopener" class="b1">View our deck</a><a v-if="data.contact_email" :href="'mailto:' + data.contact_email" class="b2">Contact us</a><a v-else-if="data.room_url" :href="webUrl(data.room_url)" target="_blank" rel="noopener" class="b2">Open data room</a></div>
      </section>

      <section v-if="data.updates.length" id="updates" class="sec">
        <h2>Updates</h2>
        <div class="ups"><NuxtLink v-for="u in data.updates" :key="u.id" :to="updLink(u.id)" class="up"><span>{{ u.title }}</span><em>{{ new Date(u.published_at + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) }} →</em></NuxtLink></div>
      </section>

      <p class="fine">Figures are reported by {{ data.company }} and are unaudited unless stated.</p>
    </div>
  </section>
</template>
<style scoped>
.wrap { max-width: 920px; margin: -24px auto 0; } .ir { font-size: 16.5px; line-height: 1.65; color: #14161a; }
.top { display: flex; align-items: center; gap: 22px; padding: 0 0 18px; border-bottom: 1px solid #ecebe7; position: sticky; top: 0; z-index: 5; background: #fff; padding-top: 12px; }
.tlogo { height: 32px; width: auto; max-width: 180px; object-fit: contain; object-position: left center; display: block; } .tname { font-size: 20px; color: var(--c-navy); }
.tl { display: flex; gap: 20px; margin-left: auto; font-size: 15px; } .tl a { color: var(--c-muted); text-decoration: none; } .tl a:hover { color: var(--c-navy); }
.tbtn { background: var(--c-navy); color: #fff; padding: 9px 16px; text-decoration: none; font-size: 14.5px; font-weight: 600; }
.covr { margin: 24px 0 0; } .covr img { width: 100%; max-height: 320px; object-fit: cover; display: block; }
.hero { padding: 64px 0 44px; display: flex; flex-direction: column; gap: 20px; } .eyebrow { font-size: 14px; color: var(--c-muted); }
.hero h1 { margin: 0; font-size: 32px; line-height: 1.1; letter-spacing: -0.03em; font-weight: 600; color: var(--c-navy); max-width: 680px; }
.links, .ctab { display: flex; flex-wrap: wrap; gap: 10px; } .links a, .ctab a { text-decoration: none; font-size: 15px; padding: 12px 20px; }
.b1 { background: var(--c-navy); color: #fff; font-weight: 600; } .b2 { border: 1px solid #d5d2cb; color: var(--c-navy); background: #fff; } .b3 { color: var(--c-blue-deep); padding-left: 8px !important; }
.big { display: grid; border-top: 2px solid var(--c-navy); } .big > div { padding: 22px 20px; border-left: 1px solid #ecebe7; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .big > div:first-child { padding-left: 0; border-left: 0; }
.big b { font-size: 34px; color: var(--c-navy); letter-spacing: -0.02em; font-weight: 600; font-variant-numeric: tabular-nums; } .big b.neg { color: #b54708; } .big span { font-size: 14px; color: var(--c-muted); } .big em { font-style: normal; font-size: 14px; color: var(--c-blue-deep); font-weight: 600; }
.src { margin: 4px 0 0; font-size: 12.5px; color: var(--c-muted); } .src a { color: var(--c-blue-deep); }
.sec { margin-top: 64px; min-width: 0; } .sec h2 { margin: 0 0 16px; font-size: 22px; color: var(--c-navy); } .pm { margin: -8px 0 12px; color: var(--c-muted); font-size: 13.5px; } .pm.pad { margin: 0; padding: 10px 14px; }
.sh { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-bottom: 30px; } .sh h2 { margin: 0; } .sh > span { font-size: 14px; color: var(--c-muted); } .sh b { color: var(--c-navy); }
.rvp { border: 1px solid #ecebe7; padding: 28px 28px 22px; }
.rvh { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; margin-bottom: 34px; }
.rvm { display: flex; flex-direction: column; gap: 4px; } .rvm .k { font-size: 13.5px; color: var(--c-muted); } .rvm > b { font-size: 40px; line-height: 1.05; letter-spacing: -0.02em; color: var(--c-navy); font-weight: 600; font-variant-numeric: tabular-nums; }
.rvc { font-size: 13.5px; color: var(--c-muted); } .rvc i { font-style: normal; font-weight: 600; padding: 2px 7px; margin-right: 4px; } .rvc i.pos { background: #e6eef6; color: var(--c-blue-deep); } .rvc i.neg { background: #fbeee6; color: #b54708; }
.rvx { display: flex; gap: 0; } .rvx > div { display: flex; flex-direction: column; gap: 2px; padding: 0 0 0 22px; margin-left: 22px; border-left: 1px solid #ecebe7; } .rvx span { font-size: 13px; color: var(--c-muted); } .rvx b { font-size: 22px; color: var(--c-navy); font-weight: 600; font-variant-numeric: tabular-nums; } .rvx b.pos { color: var(--c-blue-deep); } .rvx b.neg { color: #b54708; }
.plot { position: relative; height: 220px; padding-left: 52px; } .grid { position: absolute; inset: 0 0 0 0; pointer-events: none; } .grid span { position: absolute; left: 0; right: 0; border-top: 1px dashed #e3e1dc; } .grid em { position: absolute; left: 0; top: -9px; font-style: normal; font-size: 11.5px; color: var(--c-muted); background: #fff; padding-right: 6px; }
.bars { position: relative; display: grid; gap: 14px; align-items: end; height: 100%; border-bottom: 1px solid #c9c6bf; } .bars span { background: #c9d6e5; position: relative; min-height: 2px; transition: background .15s; } .bars span:hover { background: #8fb3d6; } .bars span.on { background: var(--c-navy); }
.bars em { position: absolute; bottom: 100%; left: -12px; right: -12px; margin-bottom: 5px; text-align: center; font-style: normal; font-size: 12px; color: var(--c-muted); white-space: nowrap; font-variant-numeric: tabular-nums; } .bars span.on em { font-weight: 600; color: var(--c-navy); font-size: 13px; }
.bl { display: grid; gap: 14px; text-align: center; font-size: 12.5px; color: var(--c-muted); padding: 9px 0 0 52px; } .bl span.on { color: var(--c-navy); font-weight: 600; } .bl span { overflow: hidden; white-space: nowrap; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; } .tile { background: #f6f5f1; padding: 18px; display: flex; flex-direction: column; gap: 2px; } .tile span { font-size: 13.5px; color: var(--c-muted); } .tile b { font-size: 24px; color: var(--c-navy); font-weight: 600; font-variant-numeric: tabular-nums; } .tile em { font-style: normal; font-size: 13px; color: var(--c-muted); } .tile em.pos { color: var(--c-blue-deep); } .tile em.neg { color: #b54708; } .spk { width: 100%; height: 38px; margin-top: 10px; display: block; }
.story.withtoc { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 48px; align-items: start; }
.toc { position: sticky; top: 84px; display: flex; flex-direction: column; gap: 9px; font-size: 14.5px; max-height: calc(100vh - 110px); overflow-y: auto; } .toc b { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-navy); margin-bottom: 2px; }
.toc a { color: var(--c-muted); text-decoration: none; line-height: 1.35; } .toc a:hover, .toc a.on { color: var(--c-navy); } .toc a.on { font-weight: 600; }
.md { color: #2b3038; max-width: 660px; min-width: 0; } .md :deep(h2), .md :deep(h3), .md :deep(h4) { color: var(--c-navy); scroll-margin-top: 84px; line-height: 1.25; letter-spacing: -0.01em; } .md :deep(h2) { font-size: 28px; margin: 48px 0 14px; } .md :deep(h3) { font-size: 22px; margin: 36px 0 10px; } .md :deep(h4) { font-size: 17px; margin: 24px 0 8px; }
.md :deep(> :first-child) { margin-top: 0; } .md :deep(p) { margin: 0 0 14px; } .md :deep(ul), .md :deep(ol) { padding-left: 22px; margin: 0 0 14px; } .md :deep(li) { margin-bottom: 6px; } .md :deep(a) { color: var(--c-blue-deep); }
.md :deep(.num) { color: var(--c-navy); font-weight: 600; background: #e6eef6; padding: 0 3px; white-space: nowrap; }
.md :deep(table) { display: table; width: 100% !important; border-collapse: collapse; margin: 8px 0 24px !important; font-size: 14px !important; } .md :deep(th) { text-align: left !important; font-weight: 600 !important; font-size: 12.5px !important; color: #fff !important; background: var(--c-navy) !important; padding: 9px 12px !important; border: 0 !important; } .md :deep(td) { padding: 9px 12px !important; border: 0 !important; border-bottom: 1px solid #ecebe7 !important; font-variant-numeric: tabular-nums; vertical-align: top; }
.md :deep(.tbar) { display: block; height: 6px; background: #eef1f5; margin-top: 5px; min-width: 60px; } .md :deep(.tbar em) { display: block; height: 100%; background: var(--c-blue-deep); }
.own { border: 1px solid #ecebe7; padding: 28px; display: flex; flex-direction: column; gap: 22px; }
.ownh { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; } .ownh > div { display: flex; flex-direction: column; gap: 2px; } .ownh b { font-size: 34px; line-height: 1.1; letter-spacing: -0.02em; color: var(--c-navy); font-weight: 600; font-variant-numeric: tabular-nums; } .ownh span { font-size: 13.5px; color: var(--c-muted); }
.ownc { background: #f6f5f1; padding: 12px 16px; max-width: 360px; } .ownc b { font-size: 20px !important; }
.stack { display: flex; height: 18px; gap: 2px; background: #fff; } .stack i { display: block; min-width: 3px; }
.ownl { display: flex; flex-direction: column; } .ownr { display: grid; grid-template-columns: minmax(0, 1fr) 120px 80px; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid #ecebe7; font-size: 15px; } .ownr:last-child { border-bottom: 1px solid #ecebe7; }
.ownr .on { display: flex; align-items: center; gap: 10px; min-width: 0; } .ownr .on i { width: 12px; height: 12px; flex: none; } .ownr .os { text-align: right; color: var(--c-muted); font-variant-numeric: tabular-nums; } .ownr b { text-align: right; color: var(--c-navy); font-weight: 600; font-variant-numeric: tabular-nums; }
.og { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; align-items: start; } .pad0 { padding: 0; overflow-x: auto; } .ot { width: 100%; border-collapse: collapse; font-size: 14px; } .ot th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); background: #fbfaf7; } .ot td { padding: 10px 14px; border-bottom: 1px solid var(--c-rule); font-variant-numeric: tabular-nums; } .ot .r { text-align: right; } .ot .tot td { font-weight: 600; }
.secs { display: flex; flex-direction: column; gap: 8px; max-width: 640px; } .sr { display: grid; grid-template-columns: 180px 1fr 56px; gap: 10px; align-items: center; font-size: 14px; } .sr i { display: block; height: 10px; background: #eef1f6; } .sr em { display: block; height: 100%; background: var(--c-blue-deep); } .sr b { text-align: right; font-weight: 500; }
.cta { background: #f6f5f1; padding: 32px 36px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 20px; } .cta > div:first-child { display: flex; flex-direction: column; } .cta span { font-size: 14px; color: var(--c-muted); } .cta b { font-size: 28px; color: var(--c-navy); letter-spacing: -0.02em; }
.ups { border-top: 1px solid #ecebe7; } .up { display: flex; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid #ecebe7; text-decoration: none; color: #14161a; } .up:hover span { color: var(--c-blue-deep); } .up em { font-style: normal; color: var(--c-muted); font-size: 14px; white-space: nowrap; }
.fine { font-size: 12.5px; color: var(--c-muted); margin: 56px 0 0; }
.nf { margin-top: 24px; } .nf p { color: var(--c-muted); margin: 8px 0 16px; } .nf .btn { text-decoration: none; }
@media (max-width: 760px) {
  .wrap { margin-top: -36px; } .tl { display: none; } .tbtn { margin-left: auto; padding: 8px 12px; font-size: 13.5px; }
  .hero { padding: 40px 0 32px; } .hero h1 { font-size: 23px; } .links a { flex: 1 1 auto; text-align: center; }
  .big { grid-template-columns: 1fr 1fr !important; } .big > div { padding: 16px 14px 16px 0 !important; border-left: 0 !important; border-bottom: 1px solid #ecebe7; } .big > div:nth-child(2n) { padding-left: 14px !important; border-left: 1px solid #ecebe7 !important; } .big b { font-size: 26px; }
  .sec { margin-top: 44px; } .rvp, .own { padding: 20px 16px; } .rvm > b { font-size: 32px; } .rvx > div:first-child { margin-left: 0; padding-left: 0; border-left: 0; } .plot { height: 160px; padding-left: 0; } .grid em { display: none; } .bars { gap: 5px; } .bl { gap: 5px; font-size: 10.5px; padding-left: 0; } .bars em { display: none; } .bars span.on em { display: block; font-size: 12px; } .ownh b { font-size: 28px; } .ownr { grid-template-columns: minmax(0, 1fr) 80px 60px; font-size: 14px; } .tiles { grid-template-columns: 1fr 1fr; } .tile { padding: 14px; } .tile b { font-size: 20px; }
  .og { grid-template-columns: 1fr; } .story.withtoc { display: block; } .toc { display: none; } .md :deep(table) { display: block; overflow-x: auto; } .md :deep(h2) { font-size: 23px; } .md :deep(h3) { font-size: 19px; }
  .sr { grid-template-columns: 110px 1fr 48px; } .cta { padding: 24px 20px; } .cta b { font-size: 22px; } .ctab { width: 100%; } .ctab a { flex: 1; text-align: center; }
}
</style>
