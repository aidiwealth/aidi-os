<script setup lang="ts">
// Public Markets: the watchlist and the lists we follow (S&P 100, ETFs, crypto), each with the latest price, the day's
// move and, once valued, the value, the margin of safety, the signal and the AI's latest headline; prices refresh every
// 30 seconds while the page is open. Open a row (or type any US symbol) to value it.
import { usd, signed, pct } from '~/shared/market-format'
useHead({ title: 'Public markets' })
const route = useRoute(); const router = useRouter()
const U: [string, string][] = [['watchlist', 'Watchlist'], ['sp100', 'S&P 100'], ['etf', 'ETFs'], ['crypto', 'Crypto']]
const u = computed({ get: () => String(route.query.u ?? 'watchlist'), set: (v: string) => router.replace({ query: { ...route.query, u: v } }) })
const q = ref(''), qd = ref('')
let t: ReturnType<typeof setTimeout> | null = null
watch(q, (v) => { if (t) clearTimeout(t); t = setTimeout(() => { qd.value = v.trim() }, 250) })
interface Row { symbol: string; name: string; kind: string; sector: string | null; watch: boolean; price: number | null; change_pct: number | null; live: boolean; fair_value: number | null; method: string | null; mos: number | null; signal: string | null; signal_label: string | null; version: number | null; spark: number[]; ai_headline: string | null; ai_stance: string | null; ai_break: boolean }
const { data, pending, refresh } = await useFetch<{ rows: Row[]; counts: { watchlist: number }; mrp_set: boolean }>('/api/markets', { query: { u, q: qd } })
const go = (s: string) => navigateTo('/markets/' + encodeURIComponent(s))
function open() { const s = q.value.trim().toUpperCase(); if (/^[A-Z0-9.\-]{1,12}$/.test(s)) go(s) }
const msg = ref('')
async function star(r: Row) { msg.value = ''; try { await $fetch('/api/markets/watchlist', { method: 'POST', body: { symbol: r.symbol, on: !r.watch } }); await refresh() } catch (e) { msg.value = (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not change the watchlist.' } }
let poll: ReturnType<typeof setInterval> | null = null
onMounted(() => { poll = setInterval(() => { if (!document.hidden) void refresh() }, 30_000) })
onBeforeUnmount(() => { if (poll) clearInterval(poll) })
const KIND: Record<string, string> = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto' }
const valueNote = (r: Row) => (r.kind === 'crypto' ? 'Sized by risk' : r.kind === 'etf' ? 'Allocation' : r.method === 'ddm' ? 'Dividend model' : r.version ? '' : 'Open to value')
</script>
<template>
  <section class="pm">
    <p class="label">Wealth management</p>
    <div class="head"><div><h1>Public markets</h1><p class="lead">Live prices, and values the AI keeps up to date. Nothing here places orders.</p></div>
      <div class="row"><NuxtLink class="btn secondary" to="/markets/assumptions">Assumptions</NuxtLink></div></div>
    <p v-if="data && !data.mrp_set" class="warn">The market risk premium is not set yet, so stocks show a beta but no value. The AI looks it up when you open Assumptions or any stock; you can also <NuxtLink to="/markets/assumptions">enter it yourself</NuxtLink>.</p>
    <div class="tools">
      <nav class="tabs" aria-label="Lists"><button v-for="[k, l] in U" :key="k" :class="{ on: u === k && !qd }" @click="q = ''; u = k">{{ l }}<em v-if="k === 'watchlist' && data">{{ data.counts.watchlist }}</em></button></nav>
      <form class="srch" @submit.prevent="open"><input v-model="q" type="search" placeholder="Symbol or company, e.g. PEP" aria-label="Find a symbol" autocapitalize="characters"><button class="btn sm" type="submit" :disabled="!q.trim()">Open</button></form>
    </div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div v-if="data?.rows.length" class="box" :class="{ dim: pending }">
      <table class="table" data-nosearch>
        <thead><tr><th class="st"><span class="sr-only">Watch</span></th><th>Symbol</th><th class="nm">Name</th><th class="sp">30 days</th><th class="n">Price</th><th class="n">Today</th><th class="n">Value<InfoTip text="The probability-weighted fair value per share from the cash-flow model (bear, base and bull cases)." /></th><th class="n">Margin of safety<InfoTip text="How far the price is below the value. Positive means the price is under the value; a bigger gap leaves more room if our estimates are wrong." /></th><th>Signal</th></tr></thead>
        <tbody><tr v-for="r in data.rows" :key="r.symbol" @click="go(r.symbol)">
          <td class="st" @click.stop><button class="sb" :class="{ on: r.watch }" :aria-label="(r.watch ? 'Remove ' : 'Add ') + r.symbol + (r.watch ? ' from' : ' to') + ' the watchlist'" :aria-pressed="r.watch" @click="star(r)">{{ r.watch ? '★' : '☆' }}</button></td>
          <td><b>{{ r.symbol }}</b></td><td class="nm">{{ r.name }}<em>{{ KIND[r.kind] }}{{ r.sector ? ' · ' + r.sector : '' }}</em><em v-if="r.ai_headline" class="aih" :class="{ brk: r.ai_break }">AI: {{ r.ai_break ? 'thesis may be broken · ' : '' }}{{ r.ai_headline }}</em></td>
          <td class="sp"><MiniLine v-if="r.spark.length > 2" :values="r.spark" :height="28" :color="r.spark[r.spark.length - 1]! >= r.spark[0]! ? '#1c547d' : '#b42318'" /></td><td class="n">{{ usd(r.price) }}</td><td class="n" :class="{ up: (r.change_pct ?? 0) > 0, dn: (r.change_pct ?? 0) < 0 }">{{ signed(r.change_pct, 2) }}</td>
          <td class="n">{{ r.fair_value != null ? usd(r.fair_value) : '' }}<em v-if="r.fair_value == null" class="mut">{{ valueNote(r) }}</em></td>
          <td class="n">{{ r.mos != null ? pct(r.mos) : '—' }}</td>
          <td><span v-if="r.signal" class="sig" :class="r.signal">{{ r.signal_label }}</span></td></tr></tbody>
      </table>
    </div>
    <EmptyState v-else-if="data" card icon="chart" :title="qd ? 'Nothing matches ' + qd : u === 'watchlist' ? 'Nothing on the watchlist yet' : 'Nothing here yet'" :text="qd ? 'Press Open to look up ' + qd.toUpperCase() + ' as a symbol.' : 'Open the S&P 100, ETFs or crypto and star what you want to follow, or type a symbol above.'" />
    <p class="foot">Prices from Alpaca (IEX) during the day, daily closes otherwise. Values are a guide only, worked out by the valuation model from stored inputs; they are not advice to any client.</p>
  </section>
</template>
<style scoped>
.pm { display: flex; flex-direction: column; gap: 14px; }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .head h1 { margin: 2px 0 4px; } .lead { margin: 0; color: var(--c-muted); max-width: 720px; font-size: 14px; } .row { display: flex; gap: 8px; }
.warn { margin: 0; padding: 10px 14px; background: #fff6e6; color: #7a4a06; font-size: 13.5px; } .warn a { color: inherit; font-weight: 600; }
.tools { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid var(--c-rule); }
.tabs { display: flex; gap: 4px; } .tabs button { font: inherit; font-size: 14px; background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 12px; color: var(--c-muted); cursor: pointer; } .tabs button.on { color: var(--c-ink); border-bottom-color: var(--c-ink); }
.tabs em { font-style: normal; margin-left: 6px; font-size: 12px; color: var(--c-muted); }
.srch { display: flex; gap: 6px; padding-bottom: 8px; } .srch input { font: inherit; font-size: 14px; height: 34px; padding: 0 10px; border: 1px solid var(--c-rule-strong); width: 260px; max-width: 60vw; } .btn.sm { height: 34px; }
.box { background: #fff; border: 1px solid var(--c-line-soft); overflow-x: auto; } .dim { opacity: .6; }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; padding: 10px 14px; white-space: nowrap; } td { padding: 10px 14px; border-top: 1px solid var(--c-line-soft); vertical-align: middle; }
tbody tr { cursor: pointer; } .n { text-align: right; white-space: nowrap; } .nm em, .n em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); }
.nm em.aih { color: var(--c-ink-soft); max-width: 420px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .nm em.brk { color: var(--c-danger); }
.sp { width: 110px; } .sp :deep(svg) { width: 100px; }
.st { width: 34px; padding-right: 0; } .sb { background: none; border: 0; font-size: 17px; color: var(--c-muted); cursor: pointer; padding: 0 2px; } .sb.on { color: var(--c-blue-deep); }
.up { color: var(--c-blue-deep); } .dn { color: var(--c-danger); } .mut { color: var(--c-muted); }
.sig { display: inline-block; font-size: 12px; font-weight: 500; padding: 3px 8px; white-space: nowrap; border: 1px solid transparent; }
.sig.strong_buy, .sig.buy { background: var(--c-blue-deep); color: #fff; } .sig.hold { background: var(--c-paper-2); color: var(--c-ink-soft); } .sig.trim { border-color: var(--c-warn); color: var(--c-warn); } .sig.sell { border-color: var(--c-danger); color: var(--c-danger); }
.sig.strong_buy::before, .sig.buy::before { content: '↑ '; } .sig.trim::before, .sig.sell::before { content: '↓ '; }
.foot { font-size: 12px; color: var(--c-muted); margin: 0; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 760px) { .nm, .sp { display: none; } }
</style>
