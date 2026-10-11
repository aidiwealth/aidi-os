<script setup lang="ts">
// Write (or edit) a wealth invoice: client, contracting entity, currency, dates, line items, how to pay.
const route = useRoute()
const editId = typeof route.query.edit === 'string' ? route.query.edit : ''
const clientQ = ref(typeof route.query.client === 'string' ? route.query.client : '')
interface Form { clients: { id: string; name: string; country: string | null }[]; entities: { id: string; name: string; address: string | null }[]; client: { id: string; name: string; email: string | null; country: string | null; entity_id: string | null } | null
  invoice: { id: string; status: string; number: string | null; client_id: string; entity_id: string | null; currency: string; method: string | null; issue_date: string; due_date: string | null; lines: { description: string; quantity: number; unit_amount: number }[]; note: string | null; bill_to: Record<string, string> | null } | null }
const { data } = await useFetch<Form>('/api/wm/invoices/form', { query: computed(() => ({ client: clientQ.value || undefined, edit: editId || undefined })) })
useHead({ title: editId ? 'Edit invoice' : 'New invoice' })
const today = new Date().toISOString().slice(0, 10)
const f = reactive({ client_id: clientQ.value, entity_id: '', currency: 'USD' as 'USD' | 'NGN', method: 'transfer' as 'online' | 'transfer', issue_date: today, due_date: '', note: '', bill_name: '', bill_email: '', bill_address: '' })
const lines = ref<{ description: string; quantity: string | number; unit_amount: string | number }[]>([{ description: '', quantity: 1, unit_amount: '' }])
const loaded = ref(false)
watch(data, (d) => {
  if (!d) return
  if (d.invoice && !loaded.value) { loaded.value = true; const i = d.invoice
    Object.assign(f, { client_id: i.client_id, entity_id: i.entity_id ?? '', currency: i.currency, method: i.method === 'online' ? 'online' : 'transfer', issue_date: i.issue_date, due_date: i.due_date ?? '', note: i.note ?? '', bill_name: i.bill_to?.name ?? '', bill_email: i.bill_to?.email ?? '', bill_address: i.bill_to?.address ?? '' })
    lines.value = i.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_amount: l.unit_amount })) }
  else if (d.client && !d.invoice) { if (!f.entity_id) f.entity_id = d.client.entity_id ?? ''; f.currency = d.client.country === 'NG' ? 'NGN' : 'USD'; f.bill_name = d.client.name; f.bill_email = d.client.email ?? '' }
}, { immediate: true })
watch(() => f.client_id, (v) => { if (!editId && v !== clientQ.value) { clientQ.value = v; f.entity_id = '' } })
const entity = computed(() => data.value?.entities.find((e) => e.id === f.entity_id))
const sym = computed(() => (f.currency === 'NGN' ? '₦' : '$'))
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: f.currency }).format(v)
const subtotal = computed(() => lines.value.reduce((t, l) => t + (Number(l.quantity) || 0) * (Number(l.unit_amount) || 0), 0))
const ready = computed(() => !!f.client_id && !!f.entity_id && lines.value.some((l) => l.description.trim() && l.unit_amount !== ''))
const busy = ref(false), msg = ref('')
async function save(send: boolean) {
  if (!ready.value) return
  busy.value = true; msg.value = ''
  const body = { client_id: f.client_id, entity_id: f.entity_id, currency: f.currency, method: f.method, issue_date: f.issue_date, due_date: f.due_date, note: f.note, send,
    bill_to: f.bill_name.trim() ? { name: f.bill_name.trim(), email: f.bill_email.trim(), address: f.bill_address.trim() } : undefined,
    lines: lines.value.filter((l) => l.description.trim() && l.unit_amount !== '').map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity) || 1, unit_amount: Number(l.unit_amount) || 0 })) }
  try { const r = await $fetch<{ id: string }>(editId ? '/api/wm/invoices/' + editId : '/api/wm/invoices', { method: 'POST', body }); await navigateTo('/wealth-mgmt/invoices/' + r.id) }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save the invoice.' } finally { busy.value = false }
}
const issued = computed(() => !!data.value?.invoice?.number)
</script>

<template>
  <section v-if="data" class="wrap">
    <NuxtLink :to="f.client_id ? '/wealth-mgmt/clients/' + f.client_id : '/wealth-mgmt'" class="back">← {{ data.client?.name ?? 'Wealth management' }}</NuxtLink>
    <p class="label">Wealth management</p>
    <h1>{{ editId ? 'Edit invoice' + (data.invoice?.number ? ' ' + data.invoice.number : '') : 'New invoice' }}</h1>
    <div class="grid">
      <div class="col">
        <div class="card">
          <h2>Who</h2>
          <div class="g2">
            <label class="label">Client<select v-model="f.client_id" :disabled="!!editId"><option value="" disabled>Choose a client</option><option v-for="c in data.clients" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
            <label class="label">Contracting entity<select v-model="f.entity_id"><option value="" disabled>Choose the entity that bills</option><option v-for="e in data.entities" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
          </div>
          <p v-if="entity" class="hint">Billed by <b>{{ entity.name }}</b>{{ entity.address ? ' · ' + entity.address : '' }}. Paid invoices post to its books.</p>
          <div class="g3">
            <label class="label">Bill to (name)<input v-model="f.bill_name" maxlength="200" placeholder="Client name"></label>
            <label class="label">Email<input v-model="f.bill_email" type="email" maxlength="254"></label>
            <label class="label">Address (optional)<input v-model="f.bill_address" maxlength="500"></label>
          </div>
        </div>
        <div class="card">
          <h2>Items</h2>
          <div class="lh"><span>Description</span><span>Qty</span><span>Unit price</span><span class="r">Amount</span><span /></div>
          <div v-for="(l, k) in lines" :key="k" class="ln">
            <input v-model="l.description" maxlength="300" placeholder="e.g. Financial plan and portfolio review" aria-label="Description">
            <input v-model="l.quantity" inputmode="decimal" aria-label="Quantity">
            <span class="cur"><i>{{ sym }}</i><input v-model="l.unit_amount" inputmode="decimal" placeholder="0.00" aria-label="Unit price"></span>
            <b class="r">{{ money((Number(l.quantity) || 0) * (Number(l.unit_amount) || 0)) }}</b>
            <button type="button" class="rm" :disabled="lines.length === 1" aria-label="Remove line" @click="lines.splice(k, 1)">×</button>
          </div>
          <button v-if="lines.length < 40" type="button" class="add" @click="lines.push({ description: '', quantity: 1, unit_amount: '' })">+ Add a line</button>
          <div class="tot"><span>Subtotal</span><b>{{ money(subtotal) }}</b></div>
          <p class="hint">VAT is added automatically where it applies (Nigeria 7.5%).</p>
          <label class="label">Note on the invoice (optional)<textarea v-model="f.note" rows="2" maxlength="1000" /></label>
        </div>
      </div>
      <aside class="col">
        <div class="card">
          <h2>Terms</h2>
          <label class="label">Currency<select v-model="f.currency"><option value="USD">USD ($)</option><option value="NGN">NGN (₦)</option></select></label>
          <label class="label">Invoice date<input v-model="f.issue_date" type="date" :max="today"><em>Back-date it for an old invoice.</em></label>
          <label class="label">Due date<input v-model="f.due_date" type="date" :min="f.issue_date"><em>Empty: 14 days after the invoice date.</em></label>
          <div class="pm"><span class="label">How the client pays</span>
            <label :class="{ on: f.method === 'transfer' }"><input v-model="f.method" type="radio" value="transfer"><b>Bank transfer</b><em>Bank details from Wealth settings</em></label>
            <label :class="{ on: f.method === 'online' }"><input v-model="f.method" type="radio" value="online"><b>Online</b><em>{{ f.currency === 'NGN' ? 'Paystack' : 'Stripe' }} pay link</em></label></div>
        </div>
        <p v-if="msg" class="error" role="alert">{{ msg }}</p>
        <div class="acts">
          <button class="btn" :disabled="!ready || busy" @click="save(true)">{{ busy ? 'Saving…' : issued ? 'Save and resend' : 'Save and email to client' }}</button>
          <button class="btn secondary" :disabled="!ready || busy" @click="save(false)">{{ issued ? 'Save changes' : 'Save as draft' }}</button>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.wrap { max-width: 1180px; } .back { display: inline-block; margin-bottom: 12px; color: var(--c-muted); text-decoration: none; font-size: 14px; } h1 { margin: 0 0 18px; }
.grid { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(280px, 1fr); gap: 20px; align-items: start; } .col { display: flex; flex-direction: column; gap: 18px; }
h2 { font-size: 16px; margin: 0 0 12px; } .card { display: flex; flex-direction: column; gap: 12px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .g3 { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 12px; }
.label { display: flex; flex-direction: column; gap: 6px; } .label em, .pm em { font-style: normal; font-size: 12px; color: var(--c-muted); font-weight: 400; }
input, select, textarea { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; width: 100%; }
.hint { margin: 0; font-size: 13px; color: var(--c-muted); }
.lh, .ln { display: grid; grid-template-columns: minmax(0, 1fr) 70px 140px 120px 28px; gap: 8px; align-items: center; } .lh { font-size: 12.5px; color: var(--c-muted); } .r { text-align: right; } .ln b { font-weight: 500; font-variant-numeric: tabular-nums; }
.cur { position: relative; } .cur i { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-style: normal; color: var(--c-muted); font-size: 13px; } .cur input { padding-left: 24px; }
.rm { background: none; border: 0; font-size: 20px; color: var(--c-muted); cursor: pointer; } .rm:disabled { opacity: .3; cursor: default; }
.add { align-self: flex-start; background: none; border: 0; padding: 0; font: inherit; font-size: 14px; color: var(--c-blue-deep); cursor: pointer; }
.tot { display: flex; justify-content: flex-end; gap: 24px; padding-top: 10px; border-top: 1px solid var(--c-rule); font-size: 15px; } .tot b { font-variant-numeric: tabular-nums; }
.pm { display: flex; flex-direction: column; gap: 6px; } .pm label { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; align-items: center; border: 1px solid var(--c-rule); padding: 10px 12px; cursor: pointer; font-size: 14px; } .pm label.on { border-color: var(--c-navy); }
.pm input { width: auto; grid-row: span 2; } .acts { display: flex; flex-direction: column; gap: 8px; } .error { color: var(--c-danger); margin: 0; }
@media (max-width: 900px) { .grid, .g2, .g3 { grid-template-columns: 1fr; } .lh { display: none; } .ln { grid-template-columns: 1fr 60px 110px 28px; } .ln b { display: none; } }
</style>
