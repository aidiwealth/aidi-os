<script setup lang="ts">
useHead({ title: 'Prices & settings' })
interface Item { cost?: string | null; fee?: string | null; cost_ngn?: string | null; fee_ngn?: string | null; cost_label?: string | null; public?: boolean; id: string; code: string; name: string; description: string | null; billing: string; price: string | null; price_ngn: string | null; region: string; currency: string; formation: boolean; active: boolean; sort: number }
interface Region { issuer: string; address: string; phone: string; email: string; bank: Record<string, string> }
const { data: s, refresh: rs } = await useFetch<{ slug: string; prefix: string; terms_days: number; note_top: string; note_bottom: string; us: Region; ng: Region; online: { usd: boolean; ngn: boolean } }>('/api/services/billing-settings')
const { data: items, refresh: ri } = await useFetch<Item[]>('/api/services/catalog')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const isAdmin = computed(() => !!me.value?.roles.includes('admin'))
const formationUrl = computed(() => 'https://app.finvry.com/formation/' + (s.value?.slug ?? ''))
const fcopied = ref(false); async function copyFormation() { await navigator.clipboard.writeText(formationUrl.value); fcopied.value = true; setTimeout(() => (fcopied.value = false), 1500) }
const US_BANK = ['Account holder', 'Bank name', 'Routing number', 'Account number', 'SWIFT code', 'Bank address']
const NG_BANK = ['Account name', 'Bank name', 'Account number', 'Sort code']
const f = reactive({ prefix: 'INV', terms_days: 30, note_top: '', note_bottom: '', us: { issuer: '', address: '', phone: '', email: '', bank: {} as Record<string, string> }, ng: { issuer: '', address: '', phone: '', email: '', bank: {} as Record<string, string> } })
watch(s, (v) => { if (v) { Object.assign(f, JSON.parse(JSON.stringify({ prefix: v.prefix, terms_days: v.terms_days, note_top: v.note_top, note_bottom: v.note_bottom, us: v.us, ng: v.ng }))); for (const k of US_BANK) f.us.bank[k] ??= ''; for (const k of NG_BANK) f.ng.bank[k] ??= '' } }, { immediate: true })
const msg = ref(''); const ok = ref('')
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' }
const saving = ref(false), saved = ref(false), saveErr = ref('')
async function save() { msg.value = ''; ok.value = ''; saveErr.value = ''; saved.value = false; saving.value = true; try { await $fetch('/api/services/billing-settings', { method: 'POST', body: f }); saved.value = true; await rs(); setTimeout(() => (saved.value = false), 4000) } catch (e) { saveErr.value = err(e) } finally { saving.value = false } }
const blank = () => ({ cost: '' as string | number, fee: '' as string | number, cost_ngn: '' as string | number, fee_ngn: '' as string | number, cost_label: '', public: true, id: '', code: '', name: '', description: '', billing: 'one_time', price: '' as string | number, price_ngn: '' as string | number, region: 'us', currency: 'USD', formation: false, active: true, sort: 10 })
const it = reactive(blank()); const editing = ref(false)
function edit(i?: Item) { Object.assign(it, blank(), i ? { ...i, description: i.description ?? '', price: i.price ?? '', price_ngn: i.price_ngn ?? '', cost: i.cost ?? '', fee: i.fee ?? '', cost_ngn: i.cost_ngn ?? '', fee_ngn: i.fee_ngn ?? '', cost_label: i.cost_label ?? '', public: i.public !== false } : {}); editing.value = true }
const sumUsd = computed(() => (it.cost !== '' || it.fee !== '' ? Number(it.cost || 0) + Number(it.fee || 0) : null))
const sumNgn = computed(() => (it.cost_ngn !== '' || it.fee_ngn !== '' ? Number(it.cost_ngn || 0) + Number(it.fee_ngn || 0) : null))
async function saveItem() { msg.value = ''; try { await $fetch('/api/services/catalog', { method: 'POST', body: { ...it, id: it.id || undefined } }); editing.value = false; await ri() } catch (e) { msg.value = err(e) } }
const BILL: Record<string, string> = { one_time: 'One-time', annual: 'Per year', monthly: 'Per month', quoted: 'Quoted (from)' }
const money = (v: string | null, c: string) => (v === null ? 'Set price' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(v)))
</script>

<template>
  <section v-if="s">
    <CsNav />
    <h1>Prices &amp; settings</h1>
    <div class="card link"><b>Formation sign-up page</b><span class="muted sm">Share this link or add it to your website. Prices come from the services marked "Offer in the formation sign-up".</span><span class="frow"><a :href="formationUrl" target="_blank" rel="noopener">{{ formationUrl }}</a><button type="button" class="btn secondary" @click="copyFormation">{{ fcopied ? 'Copied' : 'Copy link' }}</button></span></div>
    <p v-if="ok" class="ok" role="status">{{ ok }}</p><p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div class="card">
      <div class="ch"><h2>Price list</h2><button v-if="isAdmin" class="btn secondary" @click="edit()">Add service</button></div>
      <table class="t"><thead><tr><th>Service</th><th>Billing</th><th class="n">Price</th><th>Formation sign-up</th><th /></tr></thead>
        <tbody><tr v-for="i in items ?? []" :key="i.id" :class="{ off: !i.active }"><td><b>{{ i.name }}</b><span class="sub">{{ i.code }}{{ i.description ? ' · ' + i.description : '' }}</span></td><td>{{ BILL[i.billing] }}</td>
          <td class="n">{{ money(i.price, i.currency) }}<span v-if="i.price_ngn" class="ngp"> · {{ money(i.price_ngn, 'NGN') }}</span><span v-if="i.region === 'ng'" class="ngp"> · Nigeria only</span></td><td>{{ i.formation ? 'Shown' : '—' }}</td><td class="acts"><button v-if="isAdmin" class="link" @click="edit(i)">Edit</button><DeleteButton v-if="isAdmin" type="catalog" :id="i.id" :name="i.name" link @deleted="ri()" /></td></tr></tbody></table>
      <form v-if="editing" class="frm" @submit.prevent="saveItem">
        <label class="label">Name<input v-model="it.name" required maxlength="120"></label>
        <label class="label">Code<input v-model="it.code" required maxlength="40" placeholder="e.g. irs_annual"></label>
        <label class="label">Billing<select v-model="it.billing"><option v-for="(l, k) in BILL" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="label">Provider &amp; government cost (US$)<input v-model="it.cost" inputmode="decimal" placeholder="e.g. state fee + provider"></label>
        <label class="label">Finvry processing fee (US$)<input v-model="it.fee" inputmode="decimal" placeholder="Your margin"></label>
        <label class="label">Price (US$){{ sumUsd !== null ? ' · cost + fee' : '' }}<input v-if="sumUsd === null" v-model="it.price" inputmode="decimal" placeholder="Or a single price"><input v-else :value="sumUsd.toFixed(2)" disabled></label>
        <label class="label">Provider &amp; government cost (₦)<input v-model="it.cost_ngn" inputmode="decimal" placeholder="Optional"></label>
        <label class="label">Finvry processing fee (₦)<input v-model="it.fee_ngn" inputmode="decimal" placeholder="Optional"></label>
        <label class="label">Price (₦, for Nigerian companies){{ sumNgn !== null ? ' · cost + fee' : '' }}<input v-if="sumNgn === null" v-model="it.price_ngn" inputmode="decimal" placeholder="Leave blank to charge in US$"><input v-else :value="sumNgn.toFixed(2)" disabled></label>
        <label class="label">What the cost covers<input v-model="it.cost_label" maxlength="80" placeholder="e.g. Delaware state fee, registered agent provider"></label>
        <label class="label chk"><input v-model="it.public" type="checkbox"> Show on finvry.com</label>
        <label class="label">Offered to<select v-model="it.region"><option value="us">Everyone (US services)</option><option value="all">Everyone</option><option value="ng">Nigerian companies only</option></select></label>
        <label class="label">Currency<select v-model="it.currency"><option>USD</option><option>NGN</option></select></label>
        <label class="label">Order<input v-model="it.sort" inputmode="numeric"></label>
        <label class="label wide">Description<input v-model="it.description" maxlength="500"></label>
        <div class="wide row"><label class="chk"><input v-model="it.formation" type="checkbox"> Offer in the formation sign-up</label><label class="chk"><input v-model="it.active" type="checkbox"> Active</label></div>
        <div class="wide row"><button class="btn" type="submit">Save service</button><button class="btn secondary" type="button" @click="editing = false">Cancel</button></div>
      </form>
    </div>
    <form class="card frm" @submit.prevent="save">
      <h2 class="wide">Invoices</h2>
      <label class="label">Invoice number prefix<input v-model="f.prefix" required maxlength="10" :disabled="!isAdmin"></label>
      <label class="label">Payment terms (days)<input v-model="f.terms_days" inputmode="numeric" :disabled="!isAdmin"></label>
      <span />
      <label class="label wide">Message under the amount<input v-model="f.note_top" maxlength="500" :disabled="!isAdmin"></label>
      <label class="label wide">Footer note<input v-model="f.note_bottom" maxlength="500" :disabled="!isAdmin"></label>
      <template v-for="r in (['us', 'ng'] as const)" :key="r">
        <h2 class="wide sec">{{ r === 'us' ? 'United States · USD' : 'Nigeria · NGN' }}<span :class="(r === 'us' ? s.online.usd : s.online.ngn) ? 'ok' : 'muted'">{{ (r === 'us' ? s.online.usd : s.online.ngn) ? (r === 'us' ? 'Card payments on via Stripe' : 'Payments on via Paystack') : 'Online payment off (bank transfer only)' }}</span></h2>
        <label class="label">Billing entity<input v-model="f[r].issuer" maxlength="200" :disabled="!isAdmin" :placeholder="r === 'us' ? 'Aidi Ventures LLC' : 'Aidi Technology Limited'"></label>
        <label class="label">Email<input v-model="f[r].email" maxlength="254" :disabled="!isAdmin"></label>
        <label class="label">Phone<input v-model="f[r].phone" maxlength="40" :disabled="!isAdmin"></label>
        <label class="label wide">Address<textarea v-model="f[r].address" rows="2" maxlength="500" :disabled="!isAdmin" /></label>
        <label v-for="k in (r === 'us' ? US_BANK : NG_BANK)" :key="r + k" class="label">{{ k }}<input v-model="f[r].bank[k]" maxlength="120" :disabled="!isAdmin"></label>
      </template>
      <div v-if="isAdmin" class="wide row"><button class="btn" :class="{ done: saved }" type="submit" :disabled="saving">{{ saving ? 'Saving…' : saved ? '✓ Saved' : 'Save settings' }}</button><span v-if="saved" class="okb" role="status">Settings saved. New invoices use these details.</span><span v-else-if="saveErr" class="error" role="alert">{{ saveErr }}</span><span v-else class="muted sm">Bank details appear on invoices and in invoice emails for manual transfers.</span></div>
    </form>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
input, select, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .muted { color: var(--c-muted); } .ok { color: var(--c-ok); } .error { color: var(--c-danger); }

.card { margin-bottom: 14px; } .card.link { display: flex; flex-direction: column; gap: 4px; } .ch { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.t { width: 100%; border-collapse: collapse; } .t th { text-align: left; font-size: 12px; font-weight: 500; color: var(--c-muted); padding: 8px 6px; border-bottom: 1px solid var(--c-rule); } .t td { padding: 9px 6px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .t tr.off td { opacity: .5; }
.n { text-align: right; } .sub { display: block; font-size: 12px; color: var(--c-muted); } .acts { white-space: nowrap; } .link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; align-items: end; margin-top: 12px; } .frm label { display: flex; flex-direction: column; gap: 6px; } .wide { grid-column: 1 / -1; } .frm h2 { margin: 0; }
.sec { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid var(--c-rule); padding-top: 14px; margin-top: 6px !important; } .sec span { font-family: var(--font-body); font-size: 12.5px; }
.chk { display: flex !important; flex-direction: row !important; gap: 8px; align-items: center; font-size: 13px; } .chk input { width: auto; } .sm { font-size: 12.5px; }
@media (max-width: 900px) { .frm { grid-template-columns: 1fr; } }
.ngp { color: var(--c-muted); font-size: 12.5px; }
.frow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.btn.done { background: var(--c-ok); border-color: var(--c-ok); } .okb { color: var(--c-ok); font-weight: 500; font-size: 13.5px; }
</style>
