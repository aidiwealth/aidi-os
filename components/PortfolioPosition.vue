<script setup lang="ts">
// Our position in a portfolio company: cost and recorded value from Investments & AUM, against what the latest round
// says it is worth (from the founder's report, their Finvry cap table, or a round the team records). One click marks
// the holdings to it.
const props = defineProps<{ companyId: string; canEdit: boolean }>()
interface Holding { id: string; name: string; entity: string | null; currency: string; cost: number; value: number | null; instrument: string; cap: number | null; shares: number | null; ownership_pct: number | null; as_of: string | null }
interface Mark { source: string; period: string; label: string; kind: string | null; round_name: string | null; amount: number | null; price_per_share: number | null; post_money: number | null; valuation_cap: number | null; fd_shares: number | null; our_shares: number | null }
interface P { company: string; holdings: Holding[]; lines: { holding: Holding; implied: number | null; how: string }[]; marks: Mark[]; latest: Mark | null; cost: number; recorded: number | null; implied: number | null; diff: number | null; currency: string
  finvry: { as_of: string; price: number | null; price_source: string; fd: number; ours: { holder: string; shares: number; pct_fd: number; convertibles: { kind: string; amount: number; cap: number | null; post_money: boolean }[] }[] } | null; options: { id: string; name: string; cost: number | null }[] }
const { data, refresh } = await useFetch<P>(() => '/api/portfolio/' + props.companyId + '/position')
const money = (v: number | null | undefined, c = data.value?.currency ?? 'USD') => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: Math.abs(v) < 10 ? 4 : 0 }).format(v))
const mult = computed(() => (data.value?.implied != null && data.value.cost ? data.value.implied / data.value.cost : null))
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const msg = ref(''), ok = ref(''), busy = ref(false)
async function post(body: Record<string, unknown>, done: string) { busy.value = true; msg.value = ''; ok.value = ''; try { const r = await $fetch<{ marked: number }>('/api/portfolio/' + props.companyId + '/position', { method: 'POST', body }); ok.value = done.replace('{n}', String(r.marked)); await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const link = reactive({ open: false, ids: [] as string[] })
function openLink() { link.ids = data.value?.holdings.map((h) => h.id) ?? []; link.open = true }
const rd = reactive({ open: false, period: new Date().toISOString().slice(0, 7), kind: 'priced', round_name: '', amount: '', price_per_share: '', post_money: '', valuation_cap: '', fd_shares: '' })
const nz = (v: string) => (String(v).trim() === '' ? null : Number(String(v).replace(/[^0-9.]/g, '')))
async function saveRound() { await post({ round: { period: rd.period, kind: rd.kind, round_name: rd.round_name || undefined, amount: nz(rd.amount), price_per_share: nz(rd.price_per_share), post_money: nz(rd.post_money), valuation_cap: nz(rd.valuation_cap), fd_shares: nz(rd.fd_shares) } }, 'Round saved.'); if (!msg.value) rd.open = false }
const KIND: Record<string, string> = { priced: 'Priced round', safe: 'SAFE', note: 'Convertible note', other: 'Other' }
</script>
<template>
  <div v-if="data" class="card pp">
    <div class="pph"><div><h3>Our position</h3><p class="mut">{{ data.holdings.length ? 'From Investments & AUM, valued on the latest round we know of.' : 'Link the holdings in Investments & AUM to see cost, value and the latest round.' }}</p></div>
      <div v-if="canEdit" class="acts"><button class="lk" @click="openLink">{{ data.holdings.length ? 'Holdings' : 'Link holdings' }}</button><button class="lk" @click="rd.open = true">Record a round</button><button v-if="data.implied != null && data.diff && Math.abs(data.diff) > 1" class="btn sm" :disabled="busy" @click="post({ mark: true }, 'Marked {n} holding(s) to the latest round.')">Mark to {{ money(data.implied) }}</button></div></div>
    <div v-if="data.holdings.length" class="nums">
      <div><em>Invested</em><b>{{ money(data.cost) }}</b></div>
      <div><em>Recorded value</em><b>{{ money(data.recorded) }}</b><span v-if="data.recorded != null && data.cost">{{ (data.recorded / data.cost).toFixed(2) }}×</span></div>
      <div class="hi"><em>On the latest round</em><b>{{ money(data.implied) }}</b><span v-if="mult">{{ mult.toFixed(2) }}× cost</span></div>
      <div><em>Difference</em><b :class="{ up: (data.diff ?? 0) > 0, dn: (data.diff ?? 0) < 0 }">{{ data.diff == null ? '—' : (data.diff > 0 ? '+' : '') + money(data.diff) }}</b><span>{{ data.diff == null ? '' : Math.abs(data.diff) < 1 ? 'In line' : data.diff > 0 ? 'Records are below the round' : 'Records are above the round' }}</span></div>
    </div>
    <div v-if="data.latest || data.finvry" class="rnd">
      <span v-if="data.latest"><b>{{ data.latest.round_name || KIND[data.latest.kind ?? ''] || 'Latest figures' }}</b> · {{ data.latest.label }}<template v-if="data.latest.amount"> · raised {{ money(data.latest.amount) }}</template><template v-if="data.latest.price_per_share"> · {{ money(data.latest.price_per_share) }} a share</template><template v-if="data.latest.post_money"> · {{ money(data.latest.post_money) }} post-money</template><template v-if="data.latest.valuation_cap"> · {{ money(data.latest.valuation_cap) }} cap</template></span>
      <span v-if="data.finvry">On their Finvry cap table ({{ data.finvry.as_of }}): <template v-for="o in data.finvry.ours" :key="o.holder">{{ o.holder }} {{ o.shares ? Math.round(o.shares).toLocaleString('en-US') + ' shares (' + o.pct_fd.toFixed(2) + '%)' : '' }}{{ o.convertibles.length ? ' · ' + o.convertibles.map((c) => money(c.amount) + ' ' + (c.kind === 'safe' ? 'SAFE' : 'note') + (c.cap ? ' at ' + money(c.cap) + ' cap' : '')).join(', ') : '' }}; </template><template v-if="data.finvry.price">price {{ money(data.finvry.price) }} ({{ data.finvry.price_source }})</template></span>
    </div>
    <table v-if="data.lines.length" class="t"><thead><tr><th>Holding</th><th class="r">Cost</th><th class="r">Recorded</th><th class="r">On the latest round</th><th>How</th></tr></thead>
      <tbody><tr v-for="l in data.lines" :key="l.holding.id"><td><b>{{ l.holding.name }}</b><span class="sub">{{ [l.holding.entity, l.holding.instrument].filter(Boolean).join(' · ') }}</span></td><td class="r">{{ money(l.holding.cost) }}</td><td class="r">{{ money(l.holding.value) }}<span v-if="l.holding.as_of" class="sub">{{ l.holding.as_of }}</span></td><td class="r b">{{ money(l.implied) }}</td><td class="how">{{ l.how }}</td></tr></tbody></table>
    <p v-if="!data.latest && !data.finvry && data.holdings.length" class="mut">No round figures yet. Founders are asked about new money (gently, and optionally) in each report; you can also record a round you know about.</p>
    <p v-if="ok" class="okm">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
    <AppModal :open="link.open" title="Holdings for this company" @close="link.open = false">
      <div class="hl"><p class="mut">Pick the positions in Investments & AUM that are this company (we suggest ones with the same name).</p><label v-for="o in data.options" :key="o.id" class="ck"><input v-model="link.ids" type="checkbox" :value="o.id"> {{ o.name }}<span v-if="o.cost" class="sub">{{ money(o.cost) }}</span></label><p v-if="!data.options.length" class="mut">No venture holdings in Investments & AUM yet.</p></div>
      <template #foot><span class="sp" /><button class="btn secondary" @click="link.open = false">Cancel</button><button class="btn" :disabled="busy" @click="post({ holdings: link.ids }, 'Holdings saved.').then(() => (link.open = false))">Save</button></template>
    </AppModal>
    <AppModal :open="rd.open" title="Record a round" @close="rd.open = false">
      <form id="rdf2" class="g2" @submit.prevent="saveRound">
        <label class="label">Month<input v-model="rd.period" type="month" required></label>
        <label class="label">Kind<select v-model="rd.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Round name<input v-model="rd.round_name" maxlength="80" placeholder="e.g. Series A"></label>
        <label class="label">Amount raised<input v-model="rd.amount" inputmode="decimal"></label>
        <template v-if="rd.kind === 'priced'"><label class="label">Price per share<input v-model="rd.price_per_share" inputmode="decimal"></label><label class="label">Post-money valuation<input v-model="rd.post_money" inputmode="decimal"></label></template>
        <label v-else class="label">Valuation cap<input v-model="rd.valuation_cap" inputmode="decimal"></label>
        <label class="label">Fully diluted shares (optional)<input v-model="rd.fd_shares" inputmode="decimal"></label>
      </form>
      <template #foot><span class="sp" /><button class="btn secondary" @click="rd.open = false">Cancel</button><button class="btn" type="submit" form="rdf2" :disabled="busy">Save round</button></template>
    </AppModal>
  </div>
</template>
<style scoped>
.pp { display: flex; flex-direction: column; gap: 14px; margin-bottom: 14px; } .pph { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; } .pph h3 { margin: 0 0 2px; } .acts { display: flex; gap: 14px; align-items: center; }
.mut { color: var(--c-muted); font-size: 13px; margin: 0; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; } .btn.sm { padding: 6px 12px; font-size: 13px; }
.nums { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--c-rule); } .nums > div { padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; } .nums > div + div { border-left: 1px solid var(--c-rule); } .nums .hi { background: #f5f7fb; }
.nums em { font-style: normal; font-size: 12px; color: var(--c-muted); } .nums b { font-size: 20px; font-weight: 500; color: var(--c-navy); font-variant-numeric: tabular-nums; } .nums b.dn { color: var(--c-danger); } .nums span { font-size: 12px; color: var(--c-muted); }
.rnd { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--c-ink-soft); background: var(--c-paper-2); padding: 10px 12px; }
.t { width: 100%; border-collapse: collapse; } .t th { text-align: left; font-weight: 400; font-size: 12px; color: var(--c-muted); padding: 8px 10px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 9px 10px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } .r { text-align: right; } th.r { text-align: right; } .b { font-weight: 600; } .sub { display: block; font-size: 12px; color: var(--c-muted); } .how { color: var(--c-ink-soft); font-size: 12.5px; max-width: 320px; }
.okm { margin: 0; font-size: 13px; color: var(--c-ink-soft); } .error { margin: 0; color: var(--c-danger); font-size: 13px; }
.hl { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow: auto; } .ck { display: flex; gap: 8px; align-items: baseline; font-size: 13.5px; padding: 5px 0; border-bottom: 1px solid var(--c-rule); } .ck .sub { margin-left: auto; display: inline; }
.g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; } input, select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; box-sizing: border-box; } .ck input { width: auto; } .sp { flex: 1; }
@media (max-width: 800px) { .nums { grid-template-columns: 1fr 1fr; } .nums > div:nth-child(3) { border-left: 0; } }
</style>
