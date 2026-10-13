<script setup lang="ts">
// Money: drop the month's Airbnb files (CSV + Earnings report PDF), check the preview, save. Payouts are matched to the
// bank automatically; open one to see its bookings, fees and remitted tax. Rent: mark paid. Admins lock the month.
interface Row { id: string; type: string; txn_date: string; expected_arrival: string | null; confirmation_code: string | null; check_in: string | null; check_out: string | null; nights: number | null; guest: string | null; listing: string | null; unit: string | null; details: string | null; payout_ref: string | null; amount: number | null; paid_out: number | null; service_fee: number | null; cleaning_fee: number | null; gross: number | null; remitted_tax: number | null }
interface Payout extends Row { rows: Row[]; status: 'paid' | 'pending' | 'attention'; match: { method: string; note: string | null; txn_date: string | null; description: string | null; amount: number | null; account: string | null } | null }
interface Rent { id: string; tenant_name: string; unit: string; property: string; due_on: string; amount: number; paid_amount: number | null; paid_on: string | null; method: string | null; note: string | null; status: string }
interface D { period: string; label: string; payouts: Payout[]; loose: Row[]; rent: Rent[]; imports: { id: string; status: string; rows_new: number; rows_dup: number; checks: { ok: boolean; label: string; detail: string }[]; has_pdf: boolean; csv_document_id: string | null; pdf_document_id: string | null; saved_at: string; by: string | null }[]; totals: Record<string, number>; periods: string[]; locked: boolean; admin: boolean }
const route = useRoute()
const period = ref(String(route.query.period ?? ''))
const { data, refresh } = await useFetch<D>('/api/rentals/money', { query: { period } })
watch(data, (d) => { if (d && !period.value) period.value = d.period }, { immediate: true })
const months = computed(() => [...new Set([...(data.value?.periods ?? []), data.value?.period ?? ''])].filter(Boolean).sort().reverse())
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const usd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const day = (d: string | null) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—')
const ST: Record<string, string> = { paid: 'Paid', pending: 'Pending', attention: 'Needs attention', due: 'Due', overdue: 'Needs attention', partial: 'Part-paid' }
const open = ref('')
// Import
interface Prev { importId: string; label: string | null; rows: number; fresh: number; duplicates: number; payouts: number; bookings: number; paid_out: number; control: { payout_total: number; nights: number | null; remitted_tax: number } | null; checks: { ok: boolean; label: string; detail: string }[]; unmatched: string[]; locked: boolean }
const prev = ref<Prev | null>(null); const reading = ref(false)
async function upload(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []); if (!files.length) return
  const fd = new FormData(); files.forEach((f, i) => fd.append('file' + i, f))
  reading.value = true; msg.value = ''; ok.value = ''
  try { prev.value = await $fetch<Prev>('/api/rentals/import', { method: 'POST', body: fd }) } catch (x) { msg.value = err(x) } finally { reading.value = false }
}
async function saveImport() { if (!prev.value) return; busy.value = true; try { const r = await $fetch<{ added: number; duplicates: number }>('/api/rentals/imports/' + prev.value.importId + '/save', { method: 'POST' }); ok.value = 'Imported ' + r.added + ' row' + (r.added === 1 ? '' : 's') + (r.duplicates ? ' (' + r.duplicates + ' already there)' : '') + '. Payouts were matched to the bank where the deposit is uploaded.'; prev.value = null; await refresh() } catch (x) { msg.value = err(x) } finally { busy.value = false } }
async function discard() { if (prev.value) await $fetch('/api/rentals/imports/' + prev.value.importId + '/discard', { method: 'POST' }).catch(() => {}); prev.value = null }
// Match a payout by hand
const mt = reactive({ open: false, ref: '', amount: 0, arrive: '', rows: [] as { id: string; txn_date: string; description: string; amount: number; account: string }[], pick: '', note: '' })
async function openMatch(p: Payout) { Object.assign(mt, { open: true, ref: p.payout_ref, amount: p.paid_out, arrive: p.expected_arrival, rows: [], pick: '', note: '' }); try { const r = await $fetch<{ rows: typeof mt.rows }>('/api/rentals/bank-candidates', { query: { payout_ref: p.payout_ref } }); mt.rows = r.rows } catch (x) { msg.value = err(x) } }
async function saveMatch() { busy.value = true; try { await $fetch('/api/rentals/match', { method: 'POST', body: { payout_ref: mt.ref, bank_txn_id: mt.pick || null, note: mt.note || null } }); mt.open = false; await refresh() } catch (x) { msg.value = err(x) } finally { busy.value = false } }
async function unmatch(p: Payout) { if (!window.confirm('Undo the match for ' + p.payout_ref + '?')) return; try { await $fetch('/api/rentals/match', { method: 'POST', body: { payout_ref: p.payout_ref, clear: true } }); await refresh() } catch (x) { msg.value = err(x) } }
// Rent
const rp = reactive({ open: false, id: '', who: '', amount: '' as string | number, paid_on: new Date().toISOString().slice(0, 10), method: 'Bank transfer', note: '' })
function openRent(r: Rent) { Object.assign(rp, { open: true, id: r.id, who: r.tenant_name + ' · ' + r.unit, amount: r.paid_amount ?? r.amount, paid_on: r.paid_on ?? new Date().toISOString().slice(0, 10), method: r.method ?? 'Bank transfer', note: r.note ?? '' }) }
async function saveRent() { busy.value = true; try { await $fetch('/api/rentals/rent/' + rp.id + '/pay', { method: 'POST', body: rp }); rp.open = false; await refresh() } catch (x) { msg.value = err(x) } finally { busy.value = false } }
// Lock
async function lock(v: boolean) { if (!data.value || !window.confirm((v ? 'Lock ' : 'Unlock ') + data.value.label + '? ' + (v ? 'Its Airbnb rows, rent and expenses can no longer change.' : ''))) return; try { await $fetch('/api/rentals/lock', { method: 'POST', body: { period: data.value.period, locked: v } }); await refresh() } catch (x) { msg.value = err(x) } }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.open(r.url, '_blank') } catch (x) { msg.value = err(x) } }
</script>
<template>
  <div v-if="data" class="mo">
    <div class="bar"><label class="sel">Month<select v-model="period"><option v-for="m in months" :key="m" :value="m">{{ new Date(m + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }}</option></select></label>
      <span v-if="data.locked" class="lkd">🔒 Locked</span><span class="sp" /><template v-if="data.admin"><button v-if="!data.locked" type="button" class="btn secondary" @click="lock(true)">Lock month</button><button v-else type="button" class="btn secondary" @click="lock(false)">Unlock</button></template></div>
    <DropZone accept=".csv,.pdf" multiple :disabled="reading" :label="reading ? 'Reading the files…' : 'Drop the Airbnb CSV and Earnings report PDF here'" hint="Airbnb → Earnings → Transaction history (Export CSV) and Get PDF report. Both at once is best." @change="upload" />
    <p v-if="ok" class="okm">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>

    <div class="fx-stats">
      <StatTile icon="money" tone="g" label="Paid out by Airbnb" :value="usd(data.totals.paid_out)" :note="data.payouts.length + ' payouts'" />
      <StatTile icon="check" :tone="data.totals.matched >= data.totals.paid_out ? 'g' : 'a'" label="Found in the bank" :value="usd(data.totals.matched)" :note="data.totals.paid_out ? Math.round(data.totals.matched / data.totals.paid_out * 100) + '% matched' : ''" />
      <StatTile icon="chart" tone="b" label="Gross bookings" :value="usd(data.totals.gross)" :note="'Airbnb fees ' + usd(data.totals.fees)" />
      <StatTile icon="flag" tone="n" label="Taxes remitted by Airbnb" :value="usd(data.totals.tax)" note="not our income" />
      <StatTile v-if="data.rent.length" icon="building" tone="c" label="Rent" :value="usd(data.totals.rent_paid)" :note="'of ' + usd(data.totals.rent_due) + ' due'" />
    </div>

    <div class="card">
      <div class="sh"><h2>Airbnb payouts · {{ data.label }}</h2><span v-if="data.totals.attention" class="att">{{ data.totals.attention }} need attention</span></div>
      <table v-if="data.payouts.length" class="t" data-nosearch><thead><tr><th>Date</th><th>Payout</th><th>Bookings</th><th class="r">Amount</th><th>In the bank</th><th>Status</th></tr></thead>
        <tbody><template v-for="p in data.payouts" :key="p.id">
          <tr class="pr" @click="open = open === p.id ? '' : p.id"><td>{{ day(p.txn_date) }}</td><td class="mono">{{ p.payout_ref }}<span class="sub">arrives by {{ day(p.expected_arrival) }}</span></td><td>{{ p.rows.map((r) => r.guest ?? r.type).join(', ') }}<span class="sub">{{ [...new Set(p.rows.map((r) => r.unit ?? r.listing))].join(', ') }}</span></td><td class="r"><b>{{ usd(p.paid_out) }}</b></td>
            <td><template v-if="p.match"><span v-if="p.match.txn_date">{{ day(p.match.txn_date) }} · {{ p.match.account }}</span><span v-else>{{ p.match.note }}</span><span class="sub">{{ p.match.method === 'auto' ? 'Matched automatically' : p.match.method === 'manual' ? 'Matched by hand' : 'Resolved with a note' }}</span></template><span v-else class="mut">Not found yet</span></td>
            <td><span class="fx-pill" :class="{ g: p.status === 'paid', amber: p.status === 'pending', red: p.status === 'attention' }">{{ ST[p.status] }}</span></td></tr>
          <tr v-if="open === p.id" class="det"><td colspan="6">
            <table class="it" data-nosearch><thead><tr><th>Type</th><th>Guest</th><th>Room / unit</th><th>Stay</th><th class="r">Gross</th><th class="r">Cleaning</th><th class="r">Airbnb fee</th><th class="r">Tax remitted</th><th class="r">To us</th></tr></thead>
              <tbody><tr v-for="r in p.rows" :key="r.id"><td>{{ r.type }}<span v-if="r.confirmation_code" class="sub mono">{{ r.confirmation_code }}</span></td><td>{{ r.guest ?? '—' }}</td><td>{{ r.unit ?? r.listing ?? '—' }}</td><td>{{ r.check_in ? day(r.check_in) + ' – ' + day(r.check_out) + ' · ' + r.nights + ' nights' : (r.details ?? '—') }}</td>
                <td class="r">{{ usd(r.gross) }}</td><td class="r">{{ usd(r.cleaning_fee) }}</td><td class="r">{{ r.service_fee !== null ? usd(-r.service_fee) : '—' }}</td><td class="r">{{ usd(r.remitted_tax) }}</td><td class="r"><b>{{ usd(r.amount) }}</b></td></tr></tbody></table>
            <div class="acts"><button v-if="!p.match && !data.locked" type="button" class="btn sm" @click.stop="openMatch(p)">Match to the bank…</button><button v-if="p.match && data.admin && !data.locked" type="button" class="lk" @click.stop="unmatch(p)">Undo match</button></div></td></tr>
        </template></tbody></table>
      <p v-else class="mut">No Airbnb payouts for {{ data.label }} yet. Drop that month's CSV above.</p>
      <p v-if="data.loose.length" class="mut sm">{{ data.loose.length }} other row(s) this month belong to payouts in another month.</p>
    </div>

    <div v-if="data.rent.length" class="card"><h2>Rent · {{ data.label }}</h2>
      <table class="t"><thead><tr><th>Tenant</th><th>Due</th><th class="r">Rent</th><th>Paid</th><th>Status</th><th /></tr></thead>
        <tbody><tr v-for="r in data.rent" :key="r.id"><td><b>{{ r.tenant_name }}</b><span class="sub">{{ r.property }} · {{ r.unit }}</span></td><td>{{ day(r.due_on) }}</td><td class="r">{{ usd(r.amount) }}</td><td>{{ r.paid_amount !== null ? usd(r.paid_amount) + ' on ' + day(r.paid_on) : '—' }}<span v-if="r.method" class="sub">{{ r.method }}</span></td>
          <td><span class="fx-pill" :class="{ g: r.status === 'paid', amber: r.status === 'due' || r.status === 'partial', red: r.status === 'overdue' }">{{ ST[r.status] }}</span></td><td class="r"><button v-if="!data.locked && (r.status !== 'paid' || data.admin)" type="button" class="btn sm" :class="{ secondary: r.status === 'paid' }" @click="openRent(r)">{{ r.status === 'paid' ? 'Edit' : 'Mark paid' }}</button></td></tr></tbody></table></div>

    <div v-if="data.imports.length" class="card"><h2>Imports for {{ data.label }}</h2>
      <div v-for="i in data.imports" :key="i.id" class="imp"><span>{{ new Date(i.saved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }} · {{ i.by ?? 'Team' }} · {{ i.rows_new }} new{{ i.rows_dup ? ', ' + i.rows_dup + ' already there' : '' }}</span>
        <span class="ck"><span v-for="c in i.checks" :key="c.label" :class="c.ok ? 'okt' : 'bad'" :title="c.detail">{{ c.ok ? '✓' : '✕' }} {{ c.label }}</span></span>
        <span class="docs"><button v-if="i.csv_document_id" type="button" class="lk" @click="openDoc(i.csv_document_id)"><FileBadge name="a.csv" size="sm" /> CSV</button><button v-if="i.pdf_document_id" type="button" class="lk" @click="openDoc(i.pdf_document_id)"><FileBadge name="a.pdf" size="sm" /> Earnings report</button></span></div></div>

    <AppModal :open="!!prev" :title="'Check the import' + (prev?.label ? ' · ' + prev.label : '')" wide @close="discard">
      <div v-if="prev" class="ef">
        <div class="pv"><div><em>Rows</em><b>{{ prev.rows }}</b></div><div><em>New</em><b>{{ prev.fresh }}</b></div><div><em>Already imported</em><b>{{ prev.duplicates }}</b></div><div><em>Payouts</em><b>{{ prev.payouts }}</b></div><div><em>Bookings</em><b>{{ prev.bookings }}</b></div><div><em>Paid out</em><b>{{ usd(prev.paid_out) }}</b></div></div>
        <div class="checks"><div v-for="c in prev.checks" :key="c.label" class="cr" :class="c.ok ? 'okt' : 'bad'"><b>{{ c.ok ? '✓' : '✕' }} {{ c.label }}</b><span>{{ c.detail }}</span></div></div>
        <p v-if="!prev.control" class="mut">Add the Earnings report PDF too, to check the CSV against Airbnb's own totals.</p>
        <p v-if="prev.locked" class="error">This month is locked; its rows will be skipped.</p></div>
      <template #foot><button class="btn secondary" @click="discard">Discard</button><button class="btn" :disabled="busy || !prev?.fresh" @click="saveImport">{{ busy ? 'Saving…' : 'Save ' + (prev?.fresh ?? 0) + ' new rows' }}</button></template>
    </AppModal>

    <AppModal :open="mt.open" :title="'Match payout ' + mt.ref" wide @close="mt.open = false">
      <div class="ef"><p class="mut">{{ usd(mt.amount) }}, due in the bank by {{ day(mt.arrive) }}. Pick the deposit, or add a note if it isn't in an uploaded statement.</p>
        <label v-for="r in mt.rows" :key="r.id" class="cand"><input v-model="mt.pick" type="radio" :value="r.id"><span>{{ day(r.txn_date) }} · {{ r.account }}</span><span class="dsc">{{ r.description }}</span><b :class="{ okt: Math.abs(r.amount - mt.amount) < 0.01 }">{{ usd(r.amount) }}</b></label>
        <p v-if="!mt.rows.length" class="mut">No unmatched deposits near that date. Upload the bank statement under Bank &amp; cash, or add a note.</p>
        <label class="label">Note<input v-model="mt.note" maxlength="500" placeholder="e.g. Received, statement not uploaded yet"></label>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button class="btn secondary" @click="mt.open = false">Cancel</button><button class="btn" :disabled="busy || (!mt.pick && !mt.note.trim())" @click="saveMatch">Save</button></template>
    </AppModal>

    <AppModal :open="rp.open" :title="'Rent paid · ' + rp.who" @close="rp.open = false">
      <div class="ef"><div class="g2"><label class="label">Amount ($)<input v-model="rp.amount" inputmode="decimal"></label><label class="label">Paid on<input v-model="rp.paid_on" type="date"></label></div>
        <label class="label">How<select v-model="rp.method"><option>Bank transfer</option><option>Zelle</option><option>Check</option><option>Cash</option><option>Card</option><option>Other</option></select></label>
        <label class="label">Note<input v-model="rp.note" maxlength="500"></label><p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button class="btn secondary" @click="rp.open = false">Cancel</button><button class="btn" :disabled="busy" @click="saveRent">Save</button></template>
    </AppModal>
  </div>
</template>
<style scoped>
.mo { display: flex; flex-direction: column; gap: 16px; } .bar { display: flex; gap: 12px; align-items: center; } .sel { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-muted); } .sel select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); } .sp { flex: 1; } .lkd { font-size: 12.5px; color: var(--c-muted); }
.okm { color: var(--c-ok); margin: 0; font-size: 13.5px; } .error { color: var(--c-danger); margin: 0; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; } .sm { font-size: 12.5px; margin-top: 8px; }
h2 { margin: 0 0 10px; font-size: 16px; } .sh { display: flex; justify-content: space-between; align-items: baseline; } .att { font-size: 12.5px; font-weight: 600; color: var(--c-danger); }
.t { width: 100%; border-collapse: collapse; } .t th { text-align: left; font-weight: 400; font-size: 12px; color: var(--c-muted); padding: 8px 8px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 10px 8px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } .r { text-align: right; }
.pr { cursor: pointer; } .pr:hover td { background: #fafaf8; } .sub { display: block; font-size: 11.5px; color: var(--c-muted); } .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; }
.det > td { background: #fbfaf7; padding: 10px 12px 14px; } .it { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--c-rule); } .it th { text-align: left; font-weight: 400; font-size: 11.5px; color: var(--c-muted); padding: 7px 10px; border-bottom: 1px solid var(--c-rule); } .it td { padding: 8px 10px; font-size: 13px; border-bottom: 1px solid var(--c-rule); }
.acts { display: flex; gap: 12px; align-items: center; margin-top: 10px; } .lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; } .btn.sm { padding: 5px 11px; font-size: 13px; }
.imp { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; padding: 9px 0; border-top: 1px solid var(--c-rule); font-size: 13px; } .ck { display: flex; gap: 10px; flex-wrap: wrap; flex: 1; font-size: 12px; } .docs { display: flex; gap: 12px; }
.okt { color: var(--c-ok); } .bad { color: var(--c-danger); }
.ef { display: flex; flex-direction: column; gap: 12px; } .pv { display: grid; grid-template-columns: repeat(6, 1fr); border: 1px solid var(--c-rule); } .pv div { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-left: 1px solid var(--c-rule); } .pv div:first-child { border-left: 0; } .pv em { font-style: normal; font-size: 11.5px; color: var(--c-muted); } .pv b { font-size: 17px; font-weight: 500; color: var(--c-navy); }
.checks { display: flex; flex-direction: column; border: 1px solid var(--c-rule); } .cr { display: grid; grid-template-columns: 200px 1fr; gap: 10px; padding: 8px 12px; border-top: 1px solid var(--c-rule); font-size: 13px; } .cr:first-child { border-top: 0; } .cr span { color: var(--c-ink-soft); }
.cand { display: grid; grid-template-columns: auto 180px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--c-rule); font-size: 13px; cursor: pointer; } .dsc { color: var(--c-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .ef input:not([type="radio"]), .ef select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 800px) { .pv { grid-template-columns: repeat(3, 1fr); } .t { display: block; overflow-x: auto; } .cr { grid-template-columns: 1fr; } }
</style>
