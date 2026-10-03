<script setup lang="ts">
useHead({ title: 'New invoice' })
interface Item { id: string; code: string; name: string; billing: string; price: string | null; currency: string; active: boolean }
const route = useRoute()
const { data: clients } = await useFetch<{ id: string; name: string; contact_name: string; email: string }[]>('/api/services/clients/list')
const { data: catalog } = await useFetch<Item[]>('/api/services/catalog')
const { data: settings } = await useFetch<{ terms_days: number; us: { issuer: string }; ng: { issuer: string } }>('/api/services/billing-settings')
const f = reactive({ client_id: String(route.query.client ?? ''), company_id: '', region: 'us' as 'us' | 'ng', due_date: '', note: '', bill_name: '', bill_email: '', bill_address: '' })
const lines = ref<{ description: string; quantity: number | string; unit_amount: number | string }[]>([{ description: '', quantity: 1, unit_amount: '' }])
const { data: client, refresh: loadClient } = await useFetch<{ client: { name: string; contact_name: string; email: string; address: string | null }; companies: { id: string; name: string }[] }>(() => '/api/services/clients/' + (f.client_id || '00000000-0000-0000-0000-000000000000'), { immediate: !!f.client_id, watch: false })
watch(() => f.client_id, async (v) => { if (v) await loadClient() })
watchEffect(() => { const c = client.value?.client; if (c && f.client_id) { f.bill_name = c.name; f.bill_email = c.email; f.bill_address = c.address ?? '' } })
const cur = computed(() => (f.region === 'ng' ? 'NGN' : 'USD'))
const items = computed(() => (catalog.value ?? []).filter((i) => i.active && i.currency === cur.value))
function addItem(i: Item) {
  const qty = i.billing === 'monthly' ? 12 : 1
  const empty = lines.value.findIndex((l) => !l.description)
  const row = { description: i.name, quantity: qty, unit_amount: i.price ?? '' }
  if (empty >= 0) lines.value[empty] = row; else lines.value.push(row)
}
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.value }).format(v)
const total = computed(() => lines.value.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_amount) || 0), 0))
const msg = ref(''); const busy = ref(false)
async function save(send: boolean) {
  busy.value = true; msg.value = ''
  try {
    const r = await $fetch<{ id: string; emailed: boolean }>('/api/services/invoices', { method: 'POST', body: { client_id: f.client_id, company_id: f.company_id || undefined, region: f.region, due_date: f.due_date || undefined, note: f.note || undefined, send,
      lines: lines.value.filter((l) => l.description).map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_amount: Number(l.unit_amount) })), bill_to: { name: f.bill_name, email: f.bill_email, address: f.bill_address || undefined } } })
    await navigateTo('/services/invoices/' + r.id)
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save the invoice.' } finally { busy.value = false }
}
const BILL: Record<string, string> = { one_time: '', annual: '/yr', monthly: '/mo', quoted: ' (quote)' }
</script>

<template>
  <section>
    <CsNav />
    <div class="head"><h1>New invoice</h1></div>
    <div class="grid">
      <div class="card main">
        <div class="two">
          <label class="label">Client<select v-model="f.client_id" required><option value="" disabled>Choose a client</option><option v-for="c in clients ?? []" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
          <label class="label">Company<select v-model="f.company_id" :disabled="!client?.companies.length"><option value="">—</option><option v-for="c in client?.companies ?? []" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
          <label class="label">Billed by<select v-model="f.region"><option value="us">{{ settings?.us.issuer || 'US entity' }} · USD (Stripe)</option><option value="ng">{{ settings?.ng.issuer || 'Nigerian entity' }} · NGN (Paystack)</option></select></label>
          <label class="label">Due date<input v-model="f.due_date" type="date" :placeholder="'In ' + (settings?.terms_days ?? 30) + ' days'"></label>
          <label class="label">Bill to<input v-model="f.bill_name" required maxlength="200"></label>
          <label class="label">Billing email<input v-model="f.bill_email" type="email" required maxlength="254"></label>
        </div>
        <table class="ln"><thead><tr><th>Description</th><th class="q">Qty</th><th class="u">Unit price ({{ cur }})</th><th class="a">Amount</th><th /></tr></thead>
          <tbody><tr v-for="(l, i) in lines" :key="i"><td><input v-model="l.description" maxlength="300" placeholder="Service"></td><td><input v-model="l.quantity" inputmode="decimal" class="q"></td><td><input v-model="l.unit_amount" inputmode="decimal" class="u"></td>
            <td class="a">{{ money((Number(l.quantity) || 0) * (Number(l.unit_amount) || 0)) }}</td><td><button v-if="lines.length > 1" type="button" class="x" aria-label="Remove line" @click="lines.splice(i, 1)">×</button></td></tr></tbody></table>
        <div class="row"><button type="button" class="btn secondary" @click="lines.push({ description: '', quantity: 1, unit_amount: '' })">Add line</button><b class="tot">Total {{ money(total) }}</b></div>
        <label class="label">Note on the invoice (optional)<input v-model="f.note" maxlength="1000" placeholder="e.g. 2025 tax year, priced on volume of transactions"></label>
        <p v-if="msg" class="error" role="alert">{{ msg }}</p>
        <div class="row"><button class="btn" type="button" :disabled="busy || !f.client_id" @click="save(true)">Save and send</button><button class="btn secondary" type="button" :disabled="busy || !f.client_id" @click="save(false)">Save as draft</button></div>
      </div>
      <aside class="card side"><h2>Price list</h2><p class="muted sm">Click to add. Quoted services (like IRS filing) start from the listed price; adjust to the client's workload.</p>
        <button v-for="i in items" :key="i.id" type="button" class="item" @click="addItem(i)"><span>{{ i.name }}</span><b>{{ i.price ? money(Number(i.price)) + BILL[i.billing] : 'Set price' }}</b></button>
        <NuxtLink to="/services/settings" class="sm">Edit prices →</NuxtLink></aside>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }

.grid { display: grid; grid-template-columns: 1fr 300px; gap: 14px; align-items: start; } .main { display: flex; flex-direction: column; gap: 14px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; } .two label, .main > label { display: flex; flex-direction: column; gap: 6px; }
.ln { width: 100%; border-collapse: collapse; } .ln th { text-align: left; font-size: 12px; font-weight: 500; color: var(--c-muted); padding: 6px 4px; border-bottom: 1px solid var(--c-rule); } .ln td { padding: 6px 4px; border-bottom: 1px solid var(--c-rule); }
.ln td input { width: 100%; } input.q { width: 70px; } input.u { width: 130px; } .a { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; } th.q, th.u { width: 1%; white-space: nowrap; }
.x { background: none; border: 0; font-size: 18px; color: var(--c-muted); cursor: pointer; } .tot { margin-left: auto; font-family: var(--font-heading); font-weight: 500; font-size: 22px; color: var(--c-navy); }
.side { display: flex; flex-direction: column; gap: 6px; } .side h2 { margin: 0; } .sm { font-size: 12.5px; margin: 0 0 6px; }
.item { display: flex; justify-content: space-between; gap: 8px; background: #fff; border: 1px solid var(--c-rule); padding: 9px 10px; font: inherit; font-size: 13px; cursor: pointer; text-align: left; } .item:hover { border-color: var(--c-blue-deep); } .item b { font-weight: 500; color: var(--c-navy); white-space: nowrap; }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } .two { grid-template-columns: 1fr; } }
</style>
