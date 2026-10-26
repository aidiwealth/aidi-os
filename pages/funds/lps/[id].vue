<script setup lang="ts">
// One LP: what they put in and what it is worth, deal by deal or fund by fund; their calls and distributions; their
// details. Holdings, Activity and Details tabs, with headline tiles across every fund.
const id = useRoute().params.id as string
const route = useRoute(), router = useRouter()
interface M { dpi: number | null; tvpi: number | null; irr: number | null }
interface Part { fund: string; fund_id: string; currency: string; commitment: number | null; deals: { company: string; legal: string | null; instrument: string | null; cap: number | null; amount: number; status: string; value: number | null; realized: number | null }[] }
interface D { participations?: Part[]; lp: { id: string; name: string; kind: string; contact_name: string | null; email: string | null; country: string | null; kyc_status: string; notes: string | null; portal: boolean | null; portal_expires: string | null }
  positions: { fund_id: string; fund: string; currency: string; commitment: number; called: number; paidIn: number; unfunded: number; distributed: number; navShare: number; m: M }[]
  history: { id: string; fund: string; currency: string; kind: string; number: number; due_date: string; status: string; amount: string; paid_amount: string; paid_on: string | null }[] }
// Fetched together, not one after another (each wait is a round trip to the server).
const [__p1270_0, __p1270_1] = await Promise.all([
  useFetch<D>('/api/funds/lps/' + id),
  useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })])
const { data, refresh } = __p1270_0
const { data: me } = __p1270_1
const isGp = computed(() => (me.value?.roles ?? []).some((r) => ['gp', 'admin'].includes(r)))
useHead({ title: () => data.value?.lp.name ?? 'LP' })
const { money, x, pct, day } = useMoney()
const TABS = [['holdings', 'Holdings'], ['activity', 'Calls and distributions'], ['details', 'Details']] as const
const tab = computed(() => (TABS.some((t) => t[0] === route.query.t) ? String(route.query.t) : 'holdings'))
const go = (t: string) => router.replace({ query: { ...route.query, t } })
const f = reactive({ name: '', kind: 'individual', contact_name: '', email: '', country: '', kyc_status: 'pending', notes: '' })
watchEffect(() => { const l = data.value?.lp; if (l) Object.assign(f, { name: l.name, kind: l.kind, contact_name: l.contact_name ?? '', email: l.email ?? '', country: l.country ?? '', kyc_status: l.kyc_status, notes: l.notes ?? '' }) })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' }
async function run(fn: () => Promise<unknown>, done: string) { busy.value = true; msg.value = ''; ok.value = ''; try { await fn(); ok.value = done; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const save = () => run(() => $fetch('/api/funds/lps', { method: 'POST', body: { id, ...f } }), 'Saved.')
const portal = () => run(() => $fetch('/api/funds/lps/' + id + '/portal', { method: 'POST' }), 'Portal link emailed to ' + f.email + '.')
const KIND: Record<string, string> = { individual: 'Individual', entity: 'Company or trust', institution: 'Institution', gp: 'GP commitment' }
const KYC: Record<string, string> = { pending: 'KYC pending', approved: 'KYC approved', expired: 'KYC expired' }
const DS: Record<string, string> = { active: 'Active', at_cost: 'At cost', realized: 'Exited', written_off: 'Written off' }
async function viewPortal() { const w = window.open('', '_blank'); try { const r = await $fetch<{ url: string }>('/api/funds/lps/' + id + '/preview', { method: 'POST' }); if (w) w.location.href = r.url; else window.location.href = r.url } catch { w?.close(); notify('Could not open the portal preview.') } }
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('')

// Headline figures across everything this LP holds (in the first fund's currency; mixed currencies are rare).
const parts = computed(() => data.value?.participations ?? [])
const pos = computed(() => data.value?.positions ?? [])
const cur = computed(() => parts.value[0]?.currency ?? pos.value[0]?.currency ?? 'USD')
const tot = computed(() => {
  const dealIn = parts.value.reduce((s, p) => s + p.deals.reduce((a, d) => a + d.amount, 0), 0)
  const dealVal = parts.value.reduce((s, p) => s + p.deals.reduce((a, d) => a + (d.value ?? d.amount), 0), 0)
  const dealReal = parts.value.reduce((s, p) => s + p.deals.reduce((a, d) => a + (d.realized ?? 0), 0), 0)
  const committed = parts.value.reduce((s, p) => s + (p.commitment ?? 0), 0) + pos.value.reduce((s, p) => s + p.commitment, 0)
  const invested = dealIn + pos.value.reduce((s, p) => s + p.paidIn, 0)
  const value = dealVal + pos.value.reduce((s, p) => s + p.navShare, 0)
  const distributed = dealReal + pos.value.reduce((s, p) => s + p.distributed, 0)
  return { committed, invested, value, distributed, deals: parts.value.reduce((s, p) => s + p.deals.length, 0), multiple: invested ? (value + distributed) / invested : null }
})
const nothing = computed(() => !parts.value.some((p) => p.deals.length) && !pos.value.length)
</script>

<template>
  <section v-if="data" class="lpp">
    <NuxtLink to="/funds/lps" class="back">← LP register</NuxtLink>
    <div class="hd">
      <div class="who"><span class="fx-mono av">{{ initials(data.lp.name) }}</span><div><h1>{{ data.lp.name }}</h1>
        <p class="meta"><span>{{ KIND[data.lp.kind] ?? data.lp.kind }}</span><span v-if="data.lp.country">{{ data.lp.country }}</span><span v-if="data.lp.email">{{ data.lp.email }}</span><span class="kyc" :data-k="data.lp.kyc_status">{{ KYC[data.lp.kyc_status] ?? data.lp.kyc_status }}</span><span v-if="data.lp.portal">Portal link active until {{ day(data.lp.portal_expires) }}</span></p></div></div>
      <div class="acts"><button class="btn secondary" type="button" @click="viewPortal">View their portal</button><button v-if="isGp" class="btn" :disabled="busy || !data.lp.email" :title="data.lp.email ? '' : 'Add an email first'" @click="portal">Email portal link</button><DeleteButton v-if="isGp" type="lp" :id="id" :name="data.lp.name" to="/funds/lps" /></div>
    </div>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>

    <div class="fx-stats four">
      <StatTile icon="money" tone="n" label="Committed" :value="tot.committed ? money(tot.committed, cur) : '—'" :note="parts.length + pos.length + ' fund' + (parts.length + pos.length === 1 ? '' : 's')" />
      <StatTile icon="chart" tone="b" label="Invested" :value="money(tot.invested, cur)" :note="tot.deals ? tot.deals + ' deal' + (tot.deals === 1 ? '' : 's') : 'Paid in to funds'" />
      <StatTile icon="briefcase" tone="c" label="Estimated value" :value="money(tot.value, cur)" :note="tot.multiple ? tot.multiple.toFixed(2) + 'x of what went in' : 'At latest marks'" />
      <StatTile icon="billing" tone="a" label="Distributed" :value="money(tot.distributed, cur)" :note="tot.distributed ? 'Paid back' : 'Nothing yet'" />
    </div>

    <nav class="tabs" aria-label="LP"><button v-for="t in TABS" :key="t[0]" type="button" :class="{ on: tab === t[0] }" @click="go(t[0])">{{ t[1] }}<span v-if="t[0] === 'activity' && data.history.length" class="ct">{{ data.history.length }}</span></button></nav>

    <template v-if="tab === 'holdings'">
      <div v-for="pt in parts" :key="pt.fund_id" class="card blk">
        <div class="bh"><div><NuxtLink :to="'/funds/' + pt.fund_id" class="fn">{{ pt.fund }}</NuxtLink><span class="ty">Deal by deal<template v-if="pt.commitment"> · committed {{ money(pt.commitment, pt.currency) }}</template></span></div>
          <span class="sm">{{ pt.deals.length }} deal{{ pt.deals.length === 1 ? '' : 's' }}</span></div>
        <table v-if="pt.deals.length" class="t" data-nosearch>
          <thead><tr><th>Company</th><th>Terms</th><th class="r">Invested</th><th class="r">Estimated value</th><th>Status</th></tr></thead>
          <tbody><tr v-for="d in pt.deals" :key="d.company"><td><b>{{ d.company }}</b><span v-if="d.legal && d.legal !== d.company" class="sub">{{ d.legal }}</span></td>
            <td>{{ d.instrument ?? '—' }}<span v-if="d.cap" class="sub">Cap {{ money(d.cap, pt.currency) }}</span></td>
            <td class="r">{{ money(d.amount, pt.currency, true) }}</td>
            <td class="r">{{ d.value !== null ? money(d.value, pt.currency, true) : '—' }}<span v-if="d.realized" class="sub">+ {{ money(d.realized, pt.currency) }} realized</span></td>
            <td><span class="st" :data-s="d.status">{{ DS[d.status] ?? d.status }}</span></td></tr></tbody>
          <tfoot><tr><td colspan="2">Total</td><td class="r">{{ money(pt.deals.reduce((a, d) => a + d.amount, 0), pt.currency, true) }}</td><td class="r">{{ money(pt.deals.reduce((a, d) => a + (d.value ?? d.amount), 0), pt.currency, true) }}</td><td /></tr></tfoot>
        </table>
        <p v-else class="mut">Committed but not yet in a deal.</p>
        <p class="fine">Estimated value is this LP's share of each company's current mark.</p>
      </div>
      <div v-for="p in pos" :key="p.fund_id" class="card blk">
        <div class="bh"><div><NuxtLink :to="'/funds/' + p.fund_id" class="fn">{{ p.fund }}</NuxtLink><span class="ty">Closed-end fund</span></div><span class="sm">TVPI {{ x(p.m.tvpi) }} · DPI {{ x(p.m.dpi) }} · IRR {{ pct(p.m.irr) }}</span></div>
        <div class="kv">
          <div><em>Commitment</em><b>{{ money(p.commitment, p.currency) }}</b></div><div><em>Called</em><b>{{ money(p.called, p.currency) }}</b></div><div><em>Paid in</em><b>{{ money(p.paidIn, p.currency) }}</b></div>
          <div><em>Unfunded</em><b>{{ money(p.unfunded, p.currency) }}</b></div><div><em>Distributed</em><b>{{ money(p.distributed, p.currency) }}</b></div><div><em>Share of NAV</em><b>{{ money(p.navShare, p.currency) }}</b></div>
        </div>
      </div>
      <EmptyState v-if="nothing && !parts.length" card icon="funds" title="No holdings yet" text="Add a commitment on a fund's page, or add this LP as a co-investor on a deal-by-deal fund's company." />
    </template>

    <div v-else-if="tab === 'activity'" class="card blk">
      <table v-if="data.history.length" class="t" data-nosearch>
        <thead><tr><th>Notice</th><th>Fund</th><th>Due</th><th class="r">Amount</th><th class="r">Settled</th></tr></thead>
        <tbody><tr v-for="h in data.history" :key="h.id + h.kind"><td><NuxtLink :to="'/funds/calls/' + h.id" class="fn">{{ h.kind === 'call' ? 'Capital call' : 'Distribution' }} {{ h.number }}</NuxtLink></td><td>{{ h.fund }}</td><td>{{ day(h.due_date) }}</td>
          <td class="r">{{ money(h.amount, h.currency, true) }}</td><td class="r">{{ money(h.paid_amount, h.currency, true) }}<span class="sub">{{ Number(h.paid_amount) >= Number(h.amount) ? (h.paid_on ? 'Settled ' + day(h.paid_on) : 'Settled') : Number(h.paid_amount) ? 'Part paid' : 'Open' }}</span></td></tr></tbody>
      </table>
      <EmptyState v-else compact icon="funds" title="No calls or distributions yet" :text="parts.length && !pos.length ? 'Deal-by-deal investments are recorded per company, not through capital calls.' : ''" />
    </div>

    <form v-else class="card frm" @submit.prevent="save">
      <label class="lb">Name<input v-model="f.name" required maxlength="200" :disabled="!isGp"></label>
      <label class="lb">Type<select v-model="f.kind" :disabled="!isGp"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="lb">Contact person<input v-model="f.contact_name" maxlength="200" :disabled="!isGp" placeholder="For a company, trust or institution"></label>
      <label class="lb">Email<input v-model="f.email" type="email" maxlength="254" :disabled="!isGp"><em>Their portal link goes here, and deal-by-deal holdings are matched by it.</em></label>
      <label class="lb">Country<CountrySelect v-model="f.country" :disabled="!isGp" /></label>
      <label class="lb">KYC<select v-model="f.kyc_status" :disabled="!isGp"><option value="pending">Pending</option><option value="approved">Approved</option><option value="expired">Expired</option></select><em>As confirmed by your administrator.</em></label>
      <label class="lb full">Notes<textarea v-model="f.notes" rows="4" maxlength="3000" :disabled="!isGp" /></label>
      <div v-if="isGp" class="full"><button class="btn" type="submit" :disabled="busy">Save</button></div>
    </form>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 14px; color: var(--c-muted); text-decoration: none; font-size: 13.5px; }
.hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .who { display: flex; gap: 14px; align-items: center; } .av { width: 52px; height: 52px; font-size: 16px; } .who h1 { margin: 0 0 4px; }
.meta { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13.5px; color: var(--c-muted); } .acts { display: flex; gap: 8px; }
.kyc { font-size: 12px; font-weight: 600; padding: 1px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); } .kyc[data-k="approved"] { background: var(--c-navy); color: #fff; } .kyc[data-k="expired"] { background: #fdecef; color: var(--c-danger); }
.four { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 0 0 18px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; font-size: 14.5px; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: flex; gap: 6px; align-items: center; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.ct { font-size: 11px; font-weight: 600; padding: 0 6px; background: var(--c-paper-2); color: var(--c-muted); }
.blk { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.bh { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; } .bh > div { display: flex; flex-direction: column; gap: 2px; }
.fn { color: var(--c-navy); font-weight: 600; text-decoration: none; font-size: 17px; } td .fn { font-size: 13.5px; } .ty, .sm { font-size: 12.5px; color: var(--c-muted); }
.t { width: 100%; border-collapse: collapse; font-size: 13.5px; border: 1px solid var(--c-rule); } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 9px 14px; background: #fbfaf7; border-bottom: 1px solid var(--c-rule); white-space: nowrap; }
.t td { padding: 11px 14px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .t .r { text-align: right; font-variant-numeric: tabular-nums; } .t b { font-weight: 600; color: var(--c-ink); }
.t tfoot td { font-weight: 600; color: var(--c-ink); background: #fbfaf7; border-bottom: 0; }
.sub { display: block; font-size: 12px; color: var(--c-muted); font-weight: 400; }
.st { font-size: 12px; font-weight: 600; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-ink-soft); white-space: nowrap; } .st[data-s="active"] { background: var(--c-signal-soft); color: var(--c-blue-deep); } .st[data-s="realized"] { background: var(--c-navy); color: #fff; } .st[data-s="written_off"] { background: #fdecef; color: var(--c-danger); }
.kv { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border-top: 1px solid var(--c-rule); } .kv > div { display: flex; flex-direction: column; gap: 2px; padding: 12px 0; } .kv > div + div { padding-left: 14px; border-left: 1px solid var(--c-rule); }
.kv em { font-style: normal; font-size: 12px; color: var(--c-muted); } .kv b { font-family: var(--font-heading); font-size: 19px; font-weight: 500; color: var(--c-navy); font-variant-numeric: tabular-nums; }
.fine { margin: 0; font-size: 12px; color: var(--c-muted); }
.frm { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; max-width: 900px; } .full { grid-column: 1 / -1; }
.lb { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-muted); } .lb em { font-style: normal; font-size: 12px; }
.frm input, .frm select, .frm textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.mut { color: var(--c-muted); font-size: 13px; margin: 0; } .ok { color: var(--c-ink); font-size: 13.5px; } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .kv { grid-template-columns: repeat(3, 1fr); } .four { grid-template-columns: 1fr 1fr !important; } .frm { grid-template-columns: 1fr; } }
</style>
