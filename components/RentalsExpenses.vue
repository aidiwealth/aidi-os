<script setup lang="ts">
// Expenses for the rentals: log one in a popup (date, amount, category, property; optional room/unit, what was bought,
// vendor, receipt photo, repeat monthly); filter by property, month and category. Admins edit, delete, add categories.
interface E { id: string; property_id: string | null; property: string; unit_id: string | null; unit: string | null; category: string; category_label: string | null; item: string | null; quantity: number | null; vendor: string | null; amount: number; spent_on: string; receipt_document_id: string | null; recurring: boolean; recurred_from: string | null; notes: string | null; bank_txn_id?: string | null }
interface D { rows: E[]; categories: { code: string; label: string; hint: string | null }[]; properties: { id: string; name: string }[]; units: { id: string; property_id: string; name: string }[]; locked: string[]; admin: boolean }
const f = reactive({ property: '', period: new Date().toISOString().slice(0, 7), category: '' })
const { data, refresh } = await useFetch<D>('/api/rentals/expenses', { query: computed(() => ({ property: f.property || undefined, period: f.period || undefined, category: f.category || undefined })) })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const usd = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const total = computed(() => (data.value?.rows ?? []).reduce((s, r) => s + r.amount, 0))
const byCat = computed(() => { const m = new Map<string, number>(); for (const r of data.value?.rows ?? []) m.set(r.category_label ?? r.category, (m.get(r.category_label ?? r.category) ?? 0) + r.amount); return [...m.entries()].sort((a, b) => b[1] - a[1]) })
const isLocked = (d: string) => (data.value?.locked ?? []).includes(d.slice(0, 7))
// Add / edit
const blank = () => ({ bank_txn_id: '', id: '', spent_on: new Date().toISOString().slice(0, 10), amount: '' as string | number, category: '', property_id: data.value?.properties[0]?.id ?? '', unit_id: '', item: '', quantity: '' as string | number, vendor: '', recurring: false, notes: '' })
const x = reactive({ open: false, ...blank() }); const receipt = ref<File | null>(null)
const unitsFor = computed(() => (data.value?.units ?? []).filter((u) => u.property_id === x.property_id))
const hint = computed(() => data.value?.categories.find((c) => c.code === x.category)?.hint ?? '')
function add() { Object.assign(x, blank(), { open: true }); receipt.value = null; msg.value = '' }
function edit(r: E) { Object.assign(x, { open: true, bank_txn_id: '', id: r.id, spent_on: r.spent_on, amount: r.amount, category: r.category, property_id: r.property_id, unit_id: r.unit_id ?? '', item: r.item ?? '', quantity: r.quantity ?? '', vendor: r.vendor ?? '', recurring: r.recurring, notes: r.notes ?? '' }); receipt.value = null; msg.value = '' }
async function save(del = false) {
  if (del && !window.confirm('Delete this expense?')) return
  busy.value = true; msg.value = ''
  const fd = new FormData()
  if (del) { fd.append('id', x.id); fd.append('delete', 'true') } else { for (const [k, v] of Object.entries(x)) if (k !== 'open' && v !== '' && v !== null) fd.append(k, String(v)); if (receipt.value) fd.append('receipt', receipt.value) }
  try { await $fetch('/api/rentals/expenses', { method: 'POST', body: fd }); x.open = false; ok.value = del ? 'Deleted.' : x.id ? 'Saved.' : 'Expense logged.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false }
}
// From the bank: payments out of Aidi Haven's accounts not yet logged (e.g. the cleaner paid from Chase).
interface B { id: string; txn_date: string; description: string; amount: number; account: string; guess: string | null }
const { data: bank, refresh: rbank } = await useFetch<{ rows: B[]; has_accounts: boolean }>('/api/rentals/bank-spend')
const bankOpen = ref(true)
function fromBank(b: B) { Object.assign(x, blank(), { open: true, bank_txn_id: b.id, spent_on: b.txn_date, amount: b.amount, category: b.guess ?? '', vendor: b.description.slice(0, 200), notes: 'From ' + b.account }); receipt.value = null; msg.value = '' }
async function ignore(b: B) { try { await $fetch('/api/rentals/bank-ignore', { method: 'POST', body: { bank_txn_id: b.id } }); await rbank() } catch (e) { msg.value = err(e) } }
watch(() => x.open, (o) => { if (!o) rbank() })
// Categories (admins)
const cat = reactive({ open: false, label: '', hint: '' })
async function saveCat() { busy.value = true; try { await $fetch('/api/rentals/categories', { method: 'POST', body: { label: cat.label, hint: cat.hint } }); cat.open = false; cat.label = ''; cat.hint = ''; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function openDoc(id: string) { try { const r = await $fetch<{ url: string }>('/api/documents/' + id + '/download'); window.open(r.url, '_blank') } catch (e) { msg.value = err(e) } }
</script>
<template>
  <div v-if="data" class="xp">
    <div class="bar">
      <select v-model="f.property" aria-label="Property"><option value="">All expenses</option><option value="shared">Shared costs</option><option v-for="p in data.properties" :key="p.id" :value="p.id">{{ p.name }}</option></select>
      <input v-model="f.period" type="month" aria-label="Month"><button v-if="f.period" type="button" class="lk" @click="f.period = ''">All time</button>
      <select v-model="f.category" aria-label="Category"><option value="">All categories</option><option v-for="c in data.categories" :key="c.code" :value="c.code">{{ c.label }}</option></select>
      <span class="sp" /><button v-if="data.admin" type="button" class="btn secondary" @click="cat.open = true">+ Category</button><button type="button" class="btn" @click="add">+ Log expense</button></div>
    <p v-if="ok" class="okm">{{ ok }}</p><p v-if="msg && !x.open" class="error">{{ msg }}</p>
    <div class="sum card"><div class="tt"><em>Total</em><b>{{ usd(total) }}</b><span>{{ data.rows.length }} expense{{ data.rows.length === 1 ? '' : 's' }}</span></div>
      <div class="cats"><div v-for="[k, v] in byCat" :key="k" class="cb"><span>{{ k }}</span><i :style="{ width: (total ? v / total * 100 : 0) + '%' }" /><b>{{ usd(v) }}</b></div><p v-if="!byCat.length" class="mut">Nothing logged for this view.</p></div></div>
    <div v-if="bank?.rows.length" class="card bk"><button type="button" class="bh" :aria-expanded="bankOpen" @click="bankOpen = !bankOpen"><h2>From the bank <span class="n">{{ bank.rows.length }}</span></h2><span class="mut">Payments out of Aidi Haven's accounts not logged yet: cleaner, utilities, supplies…</span><span class="chev">›</span></button>
      <table v-if="bankOpen" class="t" data-nosearch><tbody><tr v-for="b in bank.rows.slice(0, 25)" :key="b.id"><td class="nw">{{ day(b.txn_date) }}</td><td><b>{{ b.description }}</b><span class="sub">{{ b.account }}{{ b.guess ? ' · looks like ' + (data.categories.find((c) => c.code === b.guess)?.label ?? b.guess) : '' }}</span></td><td class="r"><b>{{ usd(b.amount) }}</b></td>
        <td class="r nw"><button type="button" class="btn sm" @click="fromBank(b)">Log expense</button><button type="button" class="lk" @click="ignore(b)">Not a rental cost</button></td></tr></tbody></table></div>
    <p v-else-if="bank && !bank.has_accounts" class="mut">Upload Aidi Haven's Chase and Baselane statements (with transactions) to its "Chase + Baselane" account under Bank &amp; cash: payments out, like the cleaner, then show up here to log in one click.</p>
    <div class="card"><table v-if="data.rows.length" class="t"><thead><tr><th>Date</th><th>What</th><th>Property</th><th>Category</th><th class="r">Amount</th><th /></tr></thead>
      <tbody><tr v-for="r in data.rows" :key="r.id"><td>{{ day(r.spent_on) }}</td><td><b>{{ r.item || r.vendor || r.category_label }}</b><span class="sub">{{ [r.quantity ? '× ' + r.quantity : '', r.item && r.vendor ? r.vendor : '', r.notes].filter(Boolean).join(' · ') }}</span><span v-if="r.recurring || r.recurred_from" class="tag">Monthly</span><span v-if="r.bank_txn_id" class="tag bt">From the bank</span></td>
        <td>{{ r.property }}<span class="sub">{{ r.property_id ? (r.unit ?? 'Shared by its rooms') : 'Split across all units' }}</span></td><td>{{ r.category_label ?? r.category }}</td><td class="r"><b>{{ usd(r.amount) }}</b></td>
        <td class="r nw"><button v-if="r.receipt_document_id" type="button" class="lk" title="Receipt" @click="openDoc(r.receipt_document_id)"><FileBadge name="receipt.jpg" size="sm" /> Receipt</button><button v-if="data.admin && !isLocked(r.spent_on)" type="button" class="lk" @click="edit(r)">Edit</button></td></tr></tbody></table>
      <EmptyState v-else icon="billing" title="No expenses here yet" text="Log utilities, cleaning, supplies, furniture and repairs as they happen, with a photo of the receipt." /></div>

    <AppModal :open="x.open" :title="x.id ? 'Edit expense' : 'Log an expense'" wide @close="x.open = false">
      <div class="ef">
        <div class="g3"><label class="label">Date<input v-model="x.spent_on" type="date"></label><label class="label">Amount ($)<input v-model="x.amount" inputmode="decimal" placeholder="0.00"></label><label class="label">Category<select v-model="x.category"><option value="" disabled>Choose…</option><option v-for="c in data.categories" :key="c.code" :value="c.code">{{ c.label }}</option></select><em v-if="hint" class="hint">{{ hint }}</em></label></div>
        <div class="g3"><label class="label">Property<select v-model="x.property_id"><option value="">All properties (shared)</option><option v-for="p in data.properties" :key="p.id" :value="p.id">{{ p.name }}</option></select></label><label class="label">Room / unit (optional)<select v-model="x.unit_id" :disabled="!x.property_id"><option value="">Shared across the property</option><option v-for="u in unitsFor" :key="u.id" :value="u.id">{{ u.name }}</option></select></label><label class="label">Vendor<input v-model="x.vendor" maxlength="200" placeholder="e.g. PG&E, Costco"></label></div>
        <div class="g3"><label class="label">What was bought or paid for<input v-model="x.item" maxlength="300" placeholder="e.g. Queen bed linen set, internet"></label><label class="label">Quantity<input v-model="x.quantity" inputmode="decimal"></label><label class="label">Receipt photo or PDF<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic" @change="receipt = ($event.target as HTMLInputElement).files?.[0] ?? null"></label></div>
        <label class="chk"><input v-model="x.recurring" type="checkbox"> Repeat monthly (e.g. internet, utilities, insurance)</label>
        <label class="label">Notes<input v-model="x.notes" maxlength="2000"></label>
        <p v-if="msg" class="error">{{ msg }}</p></div>
      <template #foot><button v-if="x.id" class="btn secondary danger" :disabled="busy" @click="save(true)">Delete</button><span class="sp" /><button class="btn secondary" @click="x.open = false">Cancel</button><button class="btn" :disabled="busy || !x.amount || !x.category || !x.spent_on" @click="save()">{{ busy ? 'Saving…' : 'Save' }}</button></template>
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
.sum { display: grid; grid-template-columns: 220px 1fr; gap: 24px; align-items: center; } .tt { display: flex; flex-direction: column; gap: 2px; } .tt em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .tt b { font-size: 28px; font-weight: 500; color: var(--c-navy); } .tt span { font-size: 12.5px; color: var(--c-muted); }
.cats { display: flex; flex-direction: column; gap: 7px; } .cb { display: grid; grid-template-columns: 170px 1fr 100px; gap: 10px; align-items: center; font-size: 13px; } .cb i { display: block; height: 8px; background: var(--c-navy); min-width: 2px; } .cb b { text-align: right; font-weight: 500; }
.t { width: 100%; border-collapse: collapse; } .t th { text-align: left; font-weight: 400; font-size: 12px; color: var(--c-muted); padding: 8px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 10px 8px; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; vertical-align: top; } .r { text-align: right; } .nw { white-space: nowrap; }
.sub { display: block; font-size: 11.5px; color: var(--c-muted); } .tag { display: inline-block; margin-top: 3px; font-size: 10.5px; font-weight: 600; padding: 1px 6px; background: var(--c-signal-soft); color: var(--c-blue-deep); }
.lk { background: none; border: 0; padding: 0 0 0 12px; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.ef { display: flex; flex-direction: column; gap: 12px; } .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } .ef input:not([type="checkbox"]), .ef select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; min-width: 0; } .hint { font-style: normal; font-size: 12px; color: var(--c-muted); }
.bk { padding: 0; } .bh { display: flex; gap: 12px; align-items: baseline; width: 100%; background: none; border: 0; padding: 16px 18px; font: inherit; text-align: left; cursor: pointer; color: inherit; } .bh h2 { margin: 0; font-size: 16px; white-space: nowrap; } .bh .mut { flex: 1; } .bk .t { border-top: 1px solid var(--c-rule); } .bk .t td:first-child { padding-left: 18px; } .bk .t td:last-child { padding-right: 18px; }
.n { font-size: 12px; font-weight: 600; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 1px 7px; margin-left: 6px; } .chev { color: var(--c-muted); font-size: 20px; transition: transform .15s; } .bh[aria-expanded="true"] .chev { transform: rotate(90deg); } .btn.sm { padding: 5px 11px; font-size: 13px; } .tag.bt { margin-left: 4px; background: #eaf7ef; color: #1d7a45; }
.chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .chk input { width: auto; }
@media (max-width: 800px) { .g3, .sum { grid-template-columns: 1fr; } .cb { grid-template-columns: 110px 1fr 80px; } .t { display: block; overflow-x: auto; } }
</style>
