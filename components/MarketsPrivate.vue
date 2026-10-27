<script setup lang="ts">
// Pre-IPO deals beside stocks: each with the offer per share, our value, the gap after the SPV's fee and a signal; open
// one for its value range, the AI review and how much each account could put in under its pre-IPO limit, then propose.
// Deals arrive from Secondaries; terms are set here. After an IPO, record the listing and the holding moves into the
// same account as listed shares, locked up.
import { usd, pct } from '~/shared/market-format'
const { data, refresh } = await useFetch<{ deals: any[] }>('/api/markets/private', { key: 'mkt-private' })
const sel = ref('')
watchEffect(() => { if (!sel.value && data.value?.deals.length) sel.value = data.value.deals.find((d) => !d.listed_symbol)?.id ?? data.value.deals[0].id })
const { data: one, refresh: refreshOne } = await useFetch<{ deal: any; sizing: any[] }>(() => '/api/markets/private/' + (sel.value || 'none'), { key: 'mkt-private-one', immediate: false, watch: [sel] })
watch(sel, (v) => { if (v) void refreshOne() }, { immediate: true })
const d = computed(() => one.value?.deal ?? null)
const amounts = reactive<Record<string, number>>({})
watch(() => one.value?.sizing, (s) => { for (const k of Object.keys(amounts)) delete amounts[k]; for (const r of s ?? []) amounts[r.account_id] = r.amount }, { immediate: true })
const total = computed(() => Object.values(amounts).reduce((a, x) => a + (Number(x) || 0), 0))
const msg = ref(''), ok = ref(''), busy = ref('')
const err = (e: unknown) => (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'Could not do that.'
async function post(action: string, body: Record<string, unknown> = {}, done = '') {
  busy.value = action; msg.value = ''; ok.value = ''
  try { await $fetch('/api/markets/private/' + sel.value, { method: 'POST', body: { action, ...body } }); ok.value = done; await Promise.all([refresh(), refreshOne()]); return true } catch (e) { msg.value = err(e); return false } finally { busy.value = '' }
}
const propose = () => post('propose', { rows: Object.entries(amounts).filter(([, v]) => Number(v) > 0).map(([account_id, amount]) => ({ account_id, amount: Number(amount) })) }, 'Proposed. Approve it in Trades → Pre-IPO.')
const tm = reactive<Record<string, any>>({ open: false })
function terms() { const x = d.value; Object.assign(tm, { open: true, offer_price: x.offer_price ?? '', last_round_price: x.last_round_price ?? '', last_round: x.last_round ?? '', fee_pct: x.fee_pct ?? 0, carry_pct: x.carry_pct ?? 0, lockup_days: x.lockup_days ?? 180, spv_name: x.spv_name ?? '', min_investment: x.min_investment ?? '', value_low: x.value_low ?? '', value_base: x.value_base ?? '', value_high: x.value_high ?? '' }) }
async function saveTerms() { const { open: _o, ...b } = tm; void _o; if (await post('terms', b, 'Terms saved.')) tm.open = false }
const mk = reactive({ open: false, price: '' as string | number, note: '' }), ls = reactive({ open: false, symbol: '', date: new Date().toISOString().slice(0, 10) })
const SIGC: Record<string, string> = { strong_buy: 'buy', buy: 'buy', hold: 'hold', pass: 'sell' }
const gap = (x: any) => (x.mos == null ? '—' : (x.mos >= 0 ? '−' : '+') + Math.abs(x.mos).toFixed(0) + '%')
</script>
<template>
  <div v-if="data" class="mp">
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="okm">{{ ok }}</p>
    <div class="box"><table v-if="data.deals.length" class="table" data-nosearch>
      <thead><tr><th>Company</th><th>Last round</th><th class="n">Offer / share<InfoTip text="What the SPV charges per share, before its fee." /></th><th class="n">Our value<InfoTip text="The AI's base value per share (or yours), from the last round, tenders and listed peers." /></th><th class="n">Gap after fee<InfoTip text="How far the price, with the SPV's fee added, is below (−) or above (+) our value." /></th><th>Signal</th><th class="n">Held</th></tr></thead>
      <tbody><tr v-for="x in data.deals" :key="x.id" :class="{ on: sel === x.id }" @click="sel = x.id">
        <td><b>{{ x.company }}</b><em>{{ [x.sector, x.closes_at && !x.listed_symbol ? 'closes ' + x.closes_at : null, x.listed_symbol ? 'listed as ' + x.listed_symbol : null].filter(Boolean).join(' · ') }}</em></td>
        <td>{{ x.last_round ?? '—' }}<em v-if="x.last_round_price">{{ usd(x.last_round_price) }}</em></td>
        <td class="n">{{ x.offer_price ? usd(x.offer_price) : '—' }}</td><td class="n">{{ x.value_base ? usd(x.value_base) : '—' }}</td>
        <td class="n" :class="{ up: (x.mos ?? 0) > 0, dn: (x.mos ?? 0) < 0 }">{{ gap(x) }}</td>
        <td><span v-if="x.signal" class="sig" :class="SIGC[x.signal]">{{ x.signal_label }}</span><span v-else class="mut sm">{{ x.offer_price ? 'Needs a value' : 'Add terms' }}</span></td>
        <td class="n">{{ x.held_units ? usd(x.held_value) : '—' }}</td></tr></tbody></table>
      <EmptyState v-else icon="pitches" title="No pre-IPO deals yet" text="Deals arrive in Secondaries from your alerts or by hand; they show here to value and size." /></div>
    <div v-if="d" class="dt">
      <section class="card">
        <div class="h"><div><b class="t">{{ d.company }}</b><span class="mut sm">{{ d.title }}</span></div><span v-if="d.signal" class="sig" :class="SIGC[d.signal]">{{ d.signal_label }}</span></div>
        <p class="mut sm">{{ [d.closes_at ? 'Closes ' + d.closes_at : null, d.min_investment ? 'minimum ' + usd(d.min_investment) : null, d.fee_pct ? d.fee_pct + '% fee' : null, d.carry_pct ? d.carry_pct + '% carry' : null, d.spv_name].filter(Boolean).join(' · ') || 'Terms not set yet' }}</p>
        <FairRange v-if="d.effective && (d.value_low || d.value_base || d.value_high)" :bear="d.value_low" :base="d.value_base" :bull="d.value_high" :price="d.effective" />
        <div class="kv2"><span>Price against last round</span><b>{{ d.offer_price && d.last_round_price ? pct(((d.offer_price - d.last_round_price) / d.last_round_price) * 100) : '—' }}</b></div>
        <div class="kv2"><span>What an investor pays with the fee</span><b>{{ d.effective ? usd(d.effective) + ' a share' : '—' }}</b></div>
        <div class="kv2"><span>Lock-up after an IPO</span><b>{{ d.lockup_days }} days</b></div>
        <div class="kv2"><span>Mark</span><b>{{ d.mark_price ? usd(d.mark_price) + ' · ' + d.mark_on : 'At the offer price' }}</b></div>
        <div class="row"><button class="btn secondary sm" @click="terms">Edit terms</button><button class="btn secondary sm" :disabled="!!busy" @click="post('value', {}, 'The AI has valued it.')">{{ busy === 'value' ? 'Valuing… (about a minute)' : d.ai_value ? 'Value again with AI' : 'Value with AI' }}</button><button v-if="d.held_units" class="lk" @click="mk.open = true">New mark</button><button v-if="d.held_units && !d.listed_symbol" class="lk" @click="ls.open = true">It listed</button></div>
      </section>
      <section class="card">
        <b class="t2">AI review</b>
        <template v-if="d.ai_value"><p class="hl">{{ d.ai_value.headline }}</p><p class="sm">{{ d.ai_value.thesis }}</p>
          <p class="sm"><b>Value:</b> {{ d.ai_value.method }}</p><p v-if="d.ai_value.risks?.length" class="sm"><b>Risks:</b> {{ d.ai_value.risks.join('; ') }}</p><p v-if="d.ai_value.catalysts?.length" class="sm"><b>Catalysts:</b> {{ d.ai_value.catalysts.join('; ') }}</p><p class="sm"><b>Thesis breaks if:</b> {{ d.ai_value.thesis_break }}</p><p class="sm"><b>Exit:</b> {{ d.ai_value.exit }}</p>
          <p class="mut sm">Sources: <template v-for="(s, i) in d.ai_value.sources ?? []" :key="i"><a :href="s.url" target="_blank" rel="noopener">{{ s.title || 'link' }}</a>{{ i < d.ai_value.sources.length - 1 ? ' · ' : '' }}</template></p></template>
        <p v-else class="mut sm">Not valued yet. "Value with AI" looks up the last round, tenders, revenue and listed peers.</p>
        <div class="sz"><b class="t2">Sized for accounts</b>
          <div v-for="r in one?.sizing ?? []" :key="r.account_id" class="sr"><span><b>{{ r.name }}</b><em>{{ r.owner ?? '' }} · {{ r.risk.replace('_', ' ') }} · pre-IPO {{ r.private_pct }}% of {{ r.cap }}%</em><em v-if="!r.amount" class="why">{{ r.reason }}</em></span><input v-model.number="amounts[r.account_id]" type="number" min="0" step="1000" :disabled="r.owner_type !== 'entity' || r.cap === 0" :aria-label="'Amount for ' + r.name"></div>
          <button class="btn" :disabled="!!busy || !total || !d.offer_price" @click="propose">Propose {{ usd(total) }}</button><span class="mut sm">Client accounts: clients say they are interested from their portal. Retirement plans cannot hold SPV interests.</span></div>
      </section>
    </div>
    <AppModal :open="tm.open" title="Deal terms" wide @close="tm.open = false"><form id="tmf" class="fm" @submit.prevent="saveTerms">
      <div class="g3"><label>Offer per share ($)<input v-model="tm.offer_price" type="number" step="any" min="0"></label><label>Last round price ($)<input v-model="tm.last_round_price" type="number" step="any" min="0"></label><label>Last round<input v-model="tm.last_round" maxlength="80" placeholder="Series D · Mar 2025"></label>
        <label>SPV fee %<input v-model="tm.fee_pct" type="number" step="0.1" min="0"></label><label>Carry %<input v-model="tm.carry_pct" type="number" step="0.5" min="0"></label><label>Lock-up after IPO (days)<input v-model="tm.lockup_days" type="number" min="0"></label>
        <label>SPV name<input v-model="tm.spv_name" maxlength="200"></label><label>Minimum ($)<input v-model="tm.min_investment" type="number" min="0"></label><span />
        <label>Value low ($)<input v-model="tm.value_low" type="number" step="any" min="0"></label><label>Value base ($)<input v-model="tm.value_base" type="number" step="any" min="0"></label><label>Value high ($)<input v-model="tm.value_high" type="number" step="any" min="0"></label></div>
      <p class="mut sm">Leave the values empty to use the AI's range.</p></form>
      <template #foot><button class="btn secondary" @click="tm.open = false">Cancel</button><button class="btn" type="submit" form="tmf" :disabled="!!busy">Save</button></template></AppModal>
    <AppModal :open="mk.open" title="New mark" @close="mk.open = false"><div class="fm"><label>Price per share ($)<input v-model="mk.price" type="number" step="any" min="0"></label><label>Where it comes from<input v-model="mk.note" maxlength="300" placeholder="Series E, tender offer, SPV report…"></label></div>
      <template #foot><button class="btn secondary" @click="mk.open = false">Cancel</button><button class="btn" :disabled="!mk.price" @click="post('mark', { price: Number(mk.price), note: mk.note }, 'Re-valued at the new mark.').then((x) => x && (mk.open = false))">Save mark</button></template></AppModal>
    <AppModal :open="ls.open" title="Record the listing" @close="ls.open = false"><div class="fm"><p class="mut sm">Each account's units become listed shares in the same account at the same cost, locked up for {{ d?.lockup_days }} days; then they follow the normal signals and trades.</p><div class="g3"><label>Ticker<input v-model="ls.symbol" maxlength="12" placeholder="RAMP"></label><label>Listing date<input v-model="ls.date" type="date"></label></div></div>
      <template #foot><button class="btn secondary" @click="ls.open = false">Cancel</button><button class="btn" :disabled="!ls.symbol" @click="post('listed', { symbol: ls.symbol, date: ls.date }, 'Recorded: the holding is now listed shares.').then((x) => x && (ls.open = false))">Record listing</button></template></AppModal>
  </div>
</template>
<style scoped>
.mp { display: flex; flex-direction: column; gap: 12px; } .error { color: var(--c-danger); margin: 0; } .okm { color: var(--c-ok); margin: 0; } .mut { color: var(--c-muted); } .sm { font-size: 12.5px; }
.box { background: #fff; border: 1px solid var(--c-line-soft); overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; padding: 10px 14px; white-space: nowrap; } td { padding: 10px 14px; border-top: 1px solid var(--c-line-soft); } tbody tr { cursor: pointer; } tr.on { background: var(--c-paper-2); } td em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .n { text-align: right; white-space: nowrap; }
.up { color: var(--c-blue-deep); } .dn { color: var(--c-danger); }
.sig { display: inline-block; font-size: 12px; font-weight: 500; padding: 3px 8px; white-space: nowrap; border: 1px solid transparent; } .sig.buy { background: var(--c-blue-deep); color: #fff; } .sig.hold { background: var(--c-paper-2); color: var(--c-ink-soft); } .sig.sell { border-color: var(--c-danger); color: var(--c-danger); }
.dt { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } .card { margin: 0; display: flex; flex-direction: column; gap: 8px; } .h { display: flex; justify-content: space-between; align-items: flex-start; } .t { display: block; font-size: 17px; } .t2 { font-size: 15px; } .hl { font-size: 14.5px; font-weight: 500; margin: 0; } p { margin: 0; line-height: 1.5; }
.kv2 { display: flex; justify-content: space-between; padding: 7px 0; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .kv2 span { color: var(--c-muted); }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 4px; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.sz { border-top: 1px solid var(--c-rule); padding-top: 10px; margin-top: 6px; display: flex; flex-direction: column; gap: 8px; } .sr { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13.5px; } .sr em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .sr em.why { color: var(--c-ink-soft); } .sr input { width: 110px; text-align: right; font: inherit; font-size: 13.5px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); }
.fm { display: flex; flex-direction: column; gap: 10px; } .fm label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); } .fm input { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--c-rule-strong); } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 1000px) { .dt { grid-template-columns: 1fr; } }
</style>
