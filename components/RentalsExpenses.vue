<script setup lang="ts">
// Expenses for the rentals, from every source: logged by the team (matched to a bank payment, or not yet) and taken from
// the bank statements; plus bank payments still to review. Grouped by month with totals by source and category. Log one
// in a popup (date, amount, category, property; room/unit, item, vendor, receipt, repeat monthly); admins edit and delete.
interface E { id: string; property_id: string | null; property: string; unit_id: string | null; unit: string | null; category: string; category_label: string | null; item: string | null; quantity: number | null; vendor: string | null; amount: number; spent_on: string; receipt_document_id: string | null; recurring: boolean; recurred_from: string | null; notes: string | null; split: string | null; category_split: string | null; bank_txn_id?: string | null; source: 'manual' | 'matched' | 'bank'; bank_description: string | null; bank_date: string | null; bank_account: string | null }
interface D { rows: E[]; categories: { code: string; label: string; hint: string | null; split: string }[]; properties: { id: string; name: string }[]; units: { id: string; property_id: string; name: string }[]; locked: string[]; admin: boolean; receipt_ai: boolean }
const f = reactive({ property: '', period: String(new Date().getUTCFullYear()), category: '', source: 'all' as 'all' | 'manual' | 'matched' | 'bank' })
const { data, refresh } = await useFetch<D>('/api/rentals/expenses', { query: computed(() => ({ property: f.property || undefined, period: f.period || undefined, category: f.category || undefined })) })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const usd = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const SRC = { manual: 'Logged · not in bank yet', matched: 'Logged · matched to bank', bank: 'From bank statement' } as const
const all = computed(() => data.value?.rows ?? [])
const rows = computed(() => all.value.filter((r) => f.source === 'all' || r.source === f.source))
const sumOf = (list: E[]) => list.reduce((t, r) => t + r.amount, 0)
const bySrc = computed(() => ({ manual: all.value.filter((r) => r.source === 'manual'), matched: all.value.filter((r) => r.source === 'matched'), bank: all.value.filter((r) => r.source === 'bank') }))
const total = computed(() => sumOf(rows.value))
const months = computed(() => { const m = new Map<string, E[]>(); for (const r of rows.value) { const k = r.spent_on.slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) } return [...m.entries()].map(([k, list]) => ({ k, label: new Date(k + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), list, total: sumOf(list) })) })
const openMonths = ref<Set<string>>(new Set())
watch(months, (m) => { if (m.length && !openMonths.value.size) openMonths.value = new Set(m.slice(0, 2).map((x) => x.k)) }, { immediate: true })
const toggle = (k: string) => { const s = new Set(openMonths.value); if (s.has(k)) s.delete(k); else s.add(k); openMonths.value = s }
// Match a logged expense to a bank payment
interface Cand { id: string; txn_date: string; description: string; amount: number; account: string }
const mt = reactive({ open: false, id: '', label: '', amount: 0, date: '', rows: [] as Cand[], pick: '', busy: false })
async function openMatch(r: E) { Object.assign(mt, { open: true, id: r.id, label: r.item || r.vendor || r.category_label || '', amount: r.amount, date: r.spent_on, rows: [], pick: '', busy: true }); try { mt.rows = await $fetch<Cand[]>('/api/rentals/expense-match', { query: { id: r.id } }); mt.pick = mt.rows[0]?.id ?? '' } catch (e) { msg.value = err(e) } finally { mt.busy = false } }
async function saveMatch(unmatch = false) { mt.busy = true; try { await $fetch('/api/rentals/expense-match', { method: 'POST', body: { id: mt.id, bank_txn_id: unmatch ? null : mt.pick } }); mt.open = false; ok.value = unmatch ? 'Unmatched.' : 'Matched to the bank payment.'; await Promise.all([refresh(), rbank()]) } catch (e) { msg.value = err(e) } finally { mt.busy = false } }
const byCat = computed(() => { const m = new Map<string, number>(); for (const r of rows.value) m.set(r.category_label ?? r.category, (m.get(r.category_label ?? r.category) ?? 0) + r.amount); return [...m.entries()].sort((a, b) => b[1] - a[1]) })
const isLocked = (d: string) => (data.value?.locked ?? []).includes(d.slice(0, 7))
// Add / edit
const blank = () => ({ bank_txn_id: '', id: '', spent_on: new Date().toISOString().slice(0, 10), amount: '' as string | number, category: '', property_id: data.value?.properties[0]?.id ?? '', unit_id: '', item: '', quantity: '' as string | number, vendor: '', recurring: false, notes: '', split: '' })
const x = reactive({ open: false, ...blank() }); const receipt = ref<File | null>(null)
const unitsFor = computed(() => (data.value?.units ?? []).filter((u) => u.property_id === x.property_id))
const hint = computed(() => data.value?.categories.find((c) => c.code === x.category)?.hint ?? '')
const scan = reactive({ busy: false, msg: '', read: null as { readable: boolean; amount: number | null; date: string | null; payee: string | null; number: string | null } | null })
const resetScan = () => Object.assign(scan, { busy: false, msg: '', read: null })
// A dropped or chosen receipt; when AI reading is on, fill in what is still empty.
async function pickReceipt(ev: Event) {
  receipt.value = (ev.target as HTMLInputElement).files?.[0] ?? null; resetScan()
  if (!receipt.value || !data.value?.receipt_ai) return
  scan.busy = true; const fd = new FormData(); fd.append('file', receipt.value)
  try {
    const r = await $fetch<NonNullable<typeof scan.read>>('/api/rentals/scan', { method: 'POST', body: fd }); scan.read = r
    if (r.readable) { if (!x.amount && r.amount) x.amount = r.amount; if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !x.id) x.spent_on = r.date; if (!x.vendor && r.payee) x.vendor = r.payee.slice(0, 200); if (!x.notes && r.number) x.notes = 'Receipt ' + r.number }
  } catch (e) { scan.msg = err(e) } finally { scan.busy = false }
}
function add() { Object.assign(x, blank(), { open: true }); receipt.value = null; msg.value = ''; resetScan() }
function edit(r: E) { Object.assign(x, { open: true, bank_txn_id: '', id: r.id, spent_on: r.spent_on, amount: r.amount, category: r.category, property_id: r.property_id, unit_id: r.unit_id ?? '', item: r.item ?? '', quantity: r.quantity ?? '', vendor: r.vendor ?? '', recurring: r.recurring, notes: r.notes ?? '', split: r.split ?? '' }); receipt.value = null; msg.value = ''; resetScan() }
async function save(del = false) {
  if (del && !await askConfirm('Delete this expense?')) return
  busy.value = true; msg.value = ''
  const fd = new FormData()
  if (del) { fd.append('id', x.id); fd.append('delete', 'true') } else { for (const [k, v] of Object.entries(x)) if (k !== 'open' && v !== '' && v !== null) fd.append(k, String(v)); if (receipt.value) fd.append('receipt', receipt.value) }
  try { await $fetch('/api/rentals/expenses', { method: 'POST', body: fd }); x.open = false; ok.value = del ? 'Deleted.' : x.id ? 'Saved.' : 'Expense logged.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
// From the bank: payments out of Aidi Haven's accounts not yet logged (e.g. the cleaner paid from Chase).
interface B { id: string; txn_date: string; description: string; amount: number; account: string; guess: string | null }
const { data: bank, refresh: rbank } = await useFetch<{ rows: B[]; has_accounts: boolean }>('/api/rentals/bank-spend')
const bankOpen = ref(true)
function fromBank(b: B) { Object.assign(x, blank(), { open: true, bank_txn_id: b.id, spent_on: b.txn_date, amount: b.amount, category: b.guess ?? '', vendor: b.description.slice(0, 200), notes: 'From ' + b.account }); receipt.value = null; msg.value = ''; resetScan() }
async function ignore(b: B) { try { await $fetch('/api/rentals/bank-ignore', { method: 'POST', body: { bank_txn_id: b.id } }); await rbank() } catch (e) { msg.value = err(e) } }
watch(() => x.open, (o) => { if (!o) rbank() })
// How a shared cost is split (mixed model): category default, or this expense's override (GPs and admins).
const SPLIT: Record<string, string> = { weight: 'by size weight', nights: 'by nights booked', equal: 'equally' }
const catSplit = computed(() => data.value?.categories.find((c) => c.code === x.category)?.split ?? 'equal')
const splitOf = (r: E) => SPLIT[r.split ?? r.category_split ?? 'equal']
// Cost-split settings: category bases and unit weights.
interface CS { categories: { code: string; label: string; split: string }[]; units: { id: string; name: string; property: string; weight: number }[]; admin: boolean }
const cs = reactive({ open: false, data: null as CS | null, busy: false })
async function openSplit() { cs.open = true; cs.data = await $fetch<CS>('/api/rentals/cost-split') }
async function saveSplit() { if (!cs.data) return; cs.busy = true; msg.value = ''; try { await $fetch('/api/rentals/cost-split', { method: 'POST', body: { categories: cs.data.categories.map((c) => ({ code: c.code, split: c.split })), units: cs.data.units.map((u) => ({ id: u.id, weight: Number(u.weight) || 0 })) } }); cs.open = false; ok.value = 'Cost split saved. Overview and P&L now use it.'; await refresh() } catch (e) { msg.value = err(e) } finally { cs.busy = false } }
const wTot = computed(() => (cs.data?.units ?? []).reduce((s, u) => s + (Number(u.weight) || 0), 0))
// Categories (admins)
const cat = reactive({ open: false, label: '', hint: '' })
async function saveCat() { busy.value = true; try { await $fetch('/api/rentals/categories', { method: 'POST', body: { label: cat.label, hint: cat.hint } }); cat.open = false; cat.label = ''; cat.hint = ''; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.open(r.url, '_blank') } catch (e) { msg.value = err(e) } }
</script>
<template>
  <div v-if="data" class="xp">
    <div class="bar">
      <RentalsPeriod v-model="f.period" allow-all />
      <select v-model="f.property" aria-label="Property"><option value="">All properties</option><option value="shared">Shared costs</option><option v-for="p in data.properties" :key="p.id" :value="p.id">{{ p.name }}</option></select>
      <select v-model="f.category" aria-label="Category"><option value="">All categories</option><option v-for="c in data.categories" :key="c.code" :value="c.code">{{ c.label }}</option></select>
      <span class="sp" /><button type="button" class="btn secondary" @click="openSplit">How costs are split</button><button v-if="data.admin" type="button" class="btn secondary" @click="cat.open = true">+ Category</button><button type="button" class="btn" @click="add">+ Log expense</button></div>
    <p v-if="ok" class="okm">{{ ok }}</p><p v-if="msg && !x.open && !mt.open" class="error">{{ msg }}</p>

    <div class="card hd">
      <div class="ks">
        <button type="button" class="kb" :class="{ on: f.source === 'all' }" @click="f.source = 'all'"><em>All expenses</em><b>{{ brief(usd(sumOf(all))) }}</b><small>{{ all.length }} item{{ all.length === 1 ? '' : 's' }}</small></button>
        <button type="button" class="kb" :class="{ on: f.source === 'bank' }" @click="f.source = 'bank'"><em><i class="d bank" />From bank statements</em><b>{{ brief(usd(sumOf(bySrc.bank))) }}</b><small>{{ bySrc.bank.length }} item{{ bySrc.bank.length === 1 ? '' : 's' }}</small></button>
        <button type="button" class="kb" :class="{ on: f.source === 'matched' }" @click="f.source = 'matched'"><em><i class="d matched" />Logged · matched to bank</em><b>{{ brief(usd(sumOf(bySrc.matched))) }}</b><small>{{ bySrc.matched.length }} item{{ bySrc.matched.length === 1 ? '' : 's' }}</small></button>
        <button type="button" class="kb" :class="{ on: f.source === 'manual' }" @click="f.source = 'manual'"><em><i class="d manual" />Logged · not in bank yet</em><b>{{ brief(usd(sumOf(bySrc.manual))) }}</b><small>{{ bySrc.manual.length }} item{{ bySrc.manual.length === 1 ? '' : 's' }}</small></button>
        <a v-if="bank?.rows.length" href="#review" class="kb rv"><em>Bank payments to review</em><b>{{ bank.rows.length }}</b><small>{{ usd(bank.rows.reduce((t, b) => t + b.amount, 0)) }}</small></a>
      </div>
      <div class="cats"><h3>By category{{ f.source !== 'all' ? ' · ' + SRC[f.source] : '' }}</h3>
        <div v-for="[k, v] in byCat" :key="k" class="cb"><span>{{ k }}</span><i><s :style="{ width: (total ? v / total * 100 : 0) + '%' }" /></i><b>{{ usd(v) }}</b><em>{{ total ? Math.round(v / total * 100) : 0 }}%</em></div>
        <p v-if="!byCat.length" class="mut">No expenses in this view.</p></div>
    </div>

    <div v-if="rows.length" class="card ls">
      <div v-for="m in months" :key="m.k" class="mo">
        <button type="button" class="mh" :aria-expanded="openMonths.has(m.k)" @click="toggle(m.k)"><span class="chev" :class="{ o: openMonths.has(m.k) }">›</span><b>{{ m.label }}</b><span class="mut">{{ m.list.length }} item{{ m.list.length === 1 ? '' : 's' }}</span><span class="sp" /><span class="mix"><i v-for="s in (['bank', 'matched', 'manual'] as const)" :key="s" :class="'d ' + s" :style="{ width: (m.total ? sumOf(m.list.filter((r) => r.source === s)) / m.total * 120 : 0) + 'px' }" /></span><b class="mt">{{ usd(m.total) }}</b></button>
        <div v-if="openMonths.has(m.k)" class="items">
          <div v-for="r in m.list" :key="r.id" class="er">
            <span class="dt">{{ day(r.spent_on) }}</span>
            <span class="wh"><b>{{ r.item || r.vendor || r.category_label }}</b><span class="sub">{{ [r.quantity ? '× ' + r.quantity : '', r.item && r.vendor && r.source !== 'bank' ? r.vendor : '', r.source === 'bank' ? null : r.notes].filter(Boolean).join(' · ') }}<template v-if="r.bank_txn_id && r.source !== 'bank'">{{ ' · bank: ' + (r.bank_account ?? '') + ' ' + (r.bank_date ? day(r.bank_date) : '') }}</template><template v-if="r.source === 'bank'">{{ r.bank_account ?? 'Bank' }}</template></span></span>
            <span class="pr">{{ r.property_id ? r.property : 'Shared' }}<span class="sub">{{ r.unit_id ? r.unit : (r.property_id ? 'Its units, ' : 'All units, ') + splitOf(r) }}</span></span>
            <span class="ct">{{ r.category_label ?? r.category }}<span v-if="r.recurring || r.recurred_from" class="sub">Monthly</span></span>
            <span class="sr"><span class="tg" :class="r.source">{{ SRC[r.source] }}</span></span>
            <b class="am">{{ usd(r.amount) }}</b>
            <span class="ac"><button v-if="r.receipt_document_id" type="button" class="lk" title="Receipt" @click="openDoc(r.receipt_document_id)"><FileBadge name="receipt.jpg" size="sm" /></button><button v-if="r.source === 'manual' && !isLocked(r.spent_on)" type="button" class="lk" @click="openMatch(r)">Match to bank</button><button v-if="data.admin && !isLocked(r.spent_on)" type="button" class="lk" @click="edit(r)">Edit</button></span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="card"><EmptyState icon="billing" title="No expenses in this view" :text="f.source === 'all' ? 'Pick another period, or log utilities, cleaning, supplies and repairs as they happen.' : 'Nothing ' + SRC[f.source].toLowerCase() + ' in this period.'" /></div>

    <div v-if="bank?.rows.length" id="review" class="card bk"><button type="button" class="bh" :aria-expanded="bankOpen" @click="bankOpen = !bankOpen"><span class="chev" :class="{ o: bankOpen }">›</span><h2>Bank payments to review <span class="n">{{ bank.rows.length }}</span></h2><span class="mut">Payments out of Aidi Haven's accounts not yet logged: log them as a rental cost, or mark them not a rental cost.</span></button>
      <div v-if="bankOpen" class="items"><div v-for="b in bank.rows.slice(0, 40)" :key="b.id" class="er rvw"><span class="dt">{{ day(b.txn_date) }}</span><span class="wh"><b>{{ b.description }}</b><span class="sub">{{ b.account }}{{ b.guess ? ' · looks like ' + (data.categories.find((c) => c.code === b.guess)?.label ?? b.guess) : '' }}</span></span><b class="am">{{ usd(b.amount) }}</b>
        <span class="ac"><button type="button" class="btn sm" @click="fromBank(b)">Log expense</button><button type="button" class="lk" @click="ignore(b)">Not a rental cost</button></span></div></div></div>
    <p v-else-if="bank && !bank.has_accounts" class="mut">Upload Aidi Haven's Chase and Baselane statements (with transactions) to its "Chase + Baselane" account under Bank &amp; cash: payments out then show up here to log in one click.</p>

    <AppModal :open="mt.open" :title="'Match to a bank payment · ' + mt.label" wide @close="mt.open = false">
      <div class="ef"><p class="mut">{{ usd(mt.amount) }} on {{ mt.date ? day(mt.date) : '' }}. Pick the payment out of Aidi Haven's accounts that paid for it.</p>
        <p v-if="mt.busy && !mt.rows.length" class="mut">Looking…</p>
        <label v-for="c in mt.rows" :key="c.id" class="cand"><input v-model="mt.pick" type="radio" :value="c.id"><span>{{ day(c.txn_date) }} · {{ c.account }}</span><span class="dsc">{{ c.description }}</span><b :class="{ okt: Math.abs(c.amount - mt.amount) < 0.01 }">{{ usd(c.amount) }}</b></label>
        <p v-if="!mt.busy && !mt.rows.length" class="mut">No unlogged bank payment within 10 days and close to this amount. Upload that month's statements under Bank &amp; cash, then try again.</p>
        <p v-if="msg && mt.open" class="error">{{ msg }}</p></div>
      <template #foot><button class="btn secondary" @click="mt.open = false">Cancel</button><button class="btn" :disabled="mt.busy || !mt.pick" @click="saveMatch()">Match</button></template>
    </AppModal>

    <AppModal :open="x.open" :title="x.id ? 'Edit expense' : 'Log an expense'" wide @close="x.open = false">
      <div class="ef">
        <div class="g3"><label class="label">Date<input v-model="x.spent_on" type="date"></label><label class="label">Amount ($)<input v-model="x.amount" inputmode="decimal" placeholder="0.00"></label><label class="label">Category<select v-model="x.category"><option value="" disabled>Choose…</option><option v-for="c in data.categories" :key="c.code" :value="c.code">{{ c.label }}</option></select><em v-if="hint" class="hint">{{ hint }}</em></label></div>
        <div class="g3"><label class="label">Property<select v-model="x.property_id"><option value="">All properties (shared)</option><option v-for="p in data.properties" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><label class="label">Room / unit (optional)<select v-model="x.unit_id" :disabled="!x.property_id"><option value="">Shared across the property</option><option v-for="u in unitsFor" :key="u.id" :value="u.id">{{ u.name }}</option></select></label><label class="label">Vendor<input v-model="x.vendor" maxlength="200" placeholder="e.g. PG&E, Costco"></label></div>
        <div v-if="!x.unit_id" class="sv"><span>{{ x.property_id ? 'Split across this property\'s units' : 'Shared: split across all units' }}</span>
          <select v-if="data.admin" v-model="x.split" aria-label="Split"><option value="">{{ 'Category default (' + SPLIT[catSplit] + ')' }}</option><option value="weight">By size weight</option><option value="nights">By nights booked</option><option value="equal">Equally</option></select>
          <b v-else>{{ SPLIT[catSplit] }}</b>
          <em class="hint">Know exactly where it went (e.g. cleaning for the 3 Bedroom House only)? Pick that property{{ x.property_id ? ' or its room' : '' }} above instead.</em></div>
        <div class="g3"><label class="label">What was bought or paid for<input v-model="x.item" maxlength="300" placeholder="e.g. Queen bed linen set, internet"></label><label class="label">Quantity<input v-model="x.quantity" inputmode="decimal"></label><span /></div>
        <label class="label">Receipt photo or PDF<DropZone compact accept=".pdf,.png,.jpg,.jpeg,.webp,.heic" :label="receipt ? receipt.name : ''" :hint="data.receipt_ai ? 'AI reads it and fills in the amount, date and vendor.' : ''" @change="pickReceipt" /></label>
        <div v-if="scan.busy || scan.msg || scan.read" class="scan" :class="{ bad: !!scan.msg || (scan.read && !scan.read.readable) }"><template v-if="scan.busy">Reading the receipt…</template><template v-else-if="scan.msg">{{ scan.msg }}</template><template v-else-if="scan.read && !scan.read.readable">This file does not look like a receipt.</template><template v-else-if="scan.read"><b>✓ Read by AI, check before saving</b><span>{{ [scan.read.payee, scan.read.date, scan.read.amount !== null ? '$' + scan.read.amount.toFixed(2) : null].filter(Boolean).join(' · ') }}</span></template></div>
        <label class="chk"><input v-model="x.recurring" type="checkbox"> Repeat monthly (e.g. internet, utilities, insurance)</label>
        <label class="label">Notes<input v-model="x.notes" maxlength="2000"></label>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button v-if="x.id" class="btn secondary danger" :disabled="busy" @click="save(true)">Delete</button><span class="sp" /><button class="btn secondary" @click="x.open = false">Cancel</button><button class="btn" :disabled="busy || !x.amount || !x.category || !x.spent_on" @click="save()">{{ busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
    <AppModal :open="cs.open" title="How shared costs are split" wide @close="cs.open = false">
      <div v-if="cs.data" class="ef">
        <p class="mut">A cost logged to one room or unit stays there. A cost logged to a property, or shared by all, is split across the units by its category's basis. GPs and admins can override one expense, or charge it to one property or unit, from Edit.</p>
        <h3 class="sh3">By category</h3>
        <div class="cst"><div v-for="c in cs.data.categories" :key="c.code" class="csr"><span>{{ c.label }}</span>
          <select v-model="c.split" :disabled="!cs.data.admin" :aria-label="c.label"><option value="weight">By size weight</option><option value="nights">By nights booked</option><option value="equal">Equally</option></select></div></div>
        <h3 class="sh3">Size weight per room / unit</h3>
        <p class="mut">Used for "By size weight" (e.g. bedrooms or square feet). A whole ADU at 1 and each house room at 1 puts 25% on the ADU, 75% on the house.</p>
        <div class="cst"><div v-for="u in cs.data.units" :key="u.id" class="csr"><span>{{ u.name }}<em>{{ u.property }}</em></span>
          <span class="wv"><input v-model="u.weight" inputmode="decimal" :disabled="!cs.data.admin" :aria-label="'Weight for ' + u.name"><i>{{ wTot ? Math.round((Number(u.weight) || 0) / wTot * 100) : 0 }}%</i></span></div></div>
        <p class="mut">"By nights booked" uses each unit's nights in the period; with no bookings it falls back to the size weights.</p>
        <p v-if="msg && cs.open" class="error">{{ msg }}</p></div>
      <template #foot><button class="btn secondary" @click="cs.open = false">{{ cs.data?.admin ? 'Cancel' : 'Close' }}</button><button v-if="cs.data?.admin" class="btn" :disabled="cs.busy" @click="saveSplit">{{ cs.busy ? 'Saving…' : 'Save' }}</button></template>
    </AppModal>
    <AppModal :open="cat.open" title="Add a category" @close="cat.open = false">
      <div class="ef"><label class="label">Name<input v-model="cat.label" maxlength="80" placeholder="e.g. Landscaping"></label><label class="label">Examples (optional)<input v-model="cat.hint" maxlength="200"></label></div>
      <template #foot><button class="btn secondary" @click="cat.open = false">Cancel</button><button class="btn" :disabled="busy || !cat.label.trim()" @click="saveCat">Add</button></template>
    </AppModal>
  </div>
</template>
<style scoped>
.xp { display: flex; flex-direction: column; gap: 14px; } .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .bar select, .bar input { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .sp { flex: 1; }
.okm { color: var(--c-ok); margin: 0; font-size: 13.5px; } .error { color: var(--c-danger); margin: 0; } .mut { color: var(--c-muted); font-size: 13px; margin: 0; }
.hd { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 0; padding: 0; } .ks { display: grid; grid-template-columns: 1fr 1fr; border-right: 1px solid var(--c-rule); }
.kb { display: flex; flex-direction: column; gap: 2px; text-align: left; background: #fff; border: 0; border-bottom: 1px solid var(--c-rule); border-right: 1px solid var(--c-rule); padding: 14px 16px; font: inherit; cursor: pointer; color: inherit; text-decoration: none; } .kb:nth-child(2n) { border-right: 0; } .kb:first-child { grid-column: 1 / -1; border-right: 0; } .kb.on { background: #f3f6fa; box-shadow: inset 3px 0 0 var(--c-navy); }
.kb em { font-style: normal; font-size: 12.5px; color: var(--c-muted); display: flex; align-items: center; gap: 6px; } .kb b { font-size: 20px; font-weight: 600; color: var(--c-navy); } .kb:first-child b { font-size: 26px; } .kb small { font-size: 12px; color: var(--c-muted); } .kb.rv b { color: #a5650b; }
.d { display: inline-block; width: 9px; height: 9px; } .d.bank { background: #7f93ab; } .d.matched { background: var(--c-navy); } .d.manual { background: #d9a441; }
.cats { display: flex; flex-direction: column; gap: 8px; padding: 14px 18px; } .cats h3 { margin: 0 0 4px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--c-muted); font-weight: 600; }
.cb { display: grid; grid-template-columns: 140px 1fr 92px 34px; gap: 10px; align-items: center; font-size: 13px; } .cb span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .cb i { display: block; height: 8px; background: var(--c-paper-2); } .cb s { display: block; height: 100%; background: var(--c-blue, #1c547d); } .cb b { text-align: right; font-weight: 600; } .cb em { font-style: normal; font-size: 12px; color: var(--c-muted); text-align: right; }
.ls { padding: 0; } .mo + .mo { border-top: 1px solid var(--c-rule); } .mh { display: flex; gap: 10px; align-items: center; width: 100%; background: var(--c-paper-2); border: 0; padding: 11px 16px; font: inherit; cursor: pointer; color: inherit; text-align: left; } .mh .mt { min-width: 110px; text-align: right; } .mix { display: flex; height: 8px; } .mix i { height: 8px; }
.chev { color: var(--c-muted); font-size: 18px; line-height: 1; transition: transform .15s; display: inline-block; } .chev.o { transform: rotate(90deg); }
.items { display: flex; flex-direction: column; } .er { display: grid; grid-template-columns: 92px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) 170px 100px 150px; gap: 12px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--c-rule); font-size: 13.5px; } .er.rvw { grid-template-columns: 92px minmax(0, 1fr) 110px 230px; }
.dt { color: var(--c-ink-soft); font-size: 13px; white-space: nowrap; } .wh b { font-weight: 600; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .sub { display: block; font-size: 12px; color: var(--c-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .am { text-align: right; font-weight: 600; white-space: nowrap; } .ac { display: flex; justify-content: flex-end; align-items: center; gap: 2px; white-space: nowrap; }
.tg { font-size: 11.5px; padding: 2px 7px; white-space: nowrap; } .tg.bank { background: #eef1f5; color: #4b5d73; } .tg.matched { background: #e8eef5; color: var(--c-navy); } .tg.manual { background: #fbf2e1; color: #8a5a07; }
.bk { padding: 0; } .bh { display: flex; gap: 12px; align-items: baseline; width: 100%; background: none; border: 0; padding: 14px 16px; font: inherit; text-align: left; cursor: pointer; color: inherit; flex-wrap: wrap; } .bh h2 { margin: 0; font-size: 15px; }
.n { font-size: 12px; font-weight: 600; background: #fbf2e1; color: #8a5a07; padding: 1px 7px; margin-left: 6px; }
.cand { display: grid; grid-template-columns: auto 200px 1fr auto; gap: 10px; align-items: center; padding: 9px 10px; border: 1px solid var(--c-rule); font-size: 13.5px; cursor: pointer; } .cand .dsc { color: var(--c-ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .okt { color: var(--c-ok); }
@media (max-width: 1100px) { .er { grid-template-columns: 84px minmax(0, 1fr) 150px 100px; } .er .pr, .er .ct { display: none; } .er .ac { grid-column: 2 / -1; justify-content: flex-start; } .er.rvw { grid-template-columns: 84px minmax(0, 1fr) 100px; } .er.rvw .ac { grid-column: 2 / -1; } }
@media (max-width: 800px) { .hd { grid-template-columns: 1fr; } .ks { border-right: 0; } .er { grid-template-columns: 1fr auto; } .er .dt, .er .sr { display: none; } .mix { display: none; } .cand { grid-template-columns: auto 1fr auto; } .cand .dsc { display: none; } }
.lk { background: none; border: 0; padding: 0 0 0 12px; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.scan { display: flex; flex-direction: column; gap: 2px; font-size: 13px; padding: 8px 12px; border-left: 3px solid var(--c-ok); background: #f3f7fa; } .scan.bad { border-left-color: var(--c-danger); background: #fff6f5; } .scan span { color: var(--c-ink-soft); }
.ef { display: flex; flex-direction: column; gap: 12px; }
.sv { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; background: var(--c-paper-2); padding: 10px 12px; font-size: 13px; } .sv select { flex: 0 1 260px; } .sv .hint { flex-basis: 100%; }
.sh3 { margin: 6px 0 0; font-size: 14px; } .cst { border: 1px solid var(--c-rule); } .csr { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 12px; font-size: 13.5px; } .csr + .csr { border-top: 1px solid var(--c-rule); } .csr span em { display: block; font-style: normal; font-size: 12px; color: var(--c-muted); } .csr select { width: 200px; }
.wv { display: flex; align-items: center; gap: 8px; } .wv input { width: 80px !important; text-align: right; } .wv i { font-style: normal; font-size: 12px; color: var(--c-muted); width: 36px; text-align: right; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .ef input:not([type="checkbox"]), .ef select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .hint { font-style: normal; font-size: 12px; color: var(--c-muted); }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .chk input { width: auto; }
@media (max-width: 800px) { .g3 { grid-template-columns: 1fr; } .cb { grid-template-columns: 100px 1fr 80px; } .cb em { display: none; } }
</style>
