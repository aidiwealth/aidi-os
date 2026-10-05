<script setup lang="ts">
useHead({ title: 'Prices & settings' })
interface Item { id: string; code: string; name: string; description: string | null; billing: string; price: string | null; price_ngn: string | null; region: string; currency: string; formation: boolean; active: boolean; sort: number }
interface Region { issuer: string; address: string; phone: string; email: string; bank: Record<string, string> }
const { data: s, refresh: rs } = await useFetch<{ slug: string; prefix: string; terms_days: number; note_top: string; note_bottom: string; us: Region; ng: Region; online: { usd: boolean; ngn: boolean } }>('/api/services/billing-settings')
const { data: items, refresh: ri } = await useFetch<Item[]>('/api/services/catalog')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me', { key: 'me' })
const isAdmin = computed(() => !!me.value?.roles.includes('admin'))
const origin = useRequestURL().origin
const formationUrl = computed(() => origin + '/formation/' + (s.value?.slug ?? ''))
const US_BANK = ['Account holder', 'Bank name', 'Routing number', 'Account number', 'SWIFT code', 'Bank address']
const NG_BANK = ['Account name', 'Bank name', 'Account number', 'Sort code']
const f = reactive({ prefix: 'INV', terms_days: 30, note_top: '', note_bottom: '', us: { issuer: '', address: '', phone: '', email: '', bank: {} as Record<string, string> }, ng: { issuer: '', address: '', phone: '', email: '', bank: {} as Record<string, string> } })
watchEffect(() => { if (s.value) { Object.assign(f, JSON.parse(JSON.stringify({ prefix: s.value.prefix, terms_days: s.value.terms_days, note_top: s.value.note_top, note_bottom: s.value.note_bottom, us: s.value.us, ng: s.value.ng }))); for (const k of US_BANK) f.us.bank[k] ??= ''; for (const k of NG_BANK) f.ng.bank[k] ??= '' } })
const msg = ref(''); const ok = ref('')
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.' }
async function save() { msg.value = ''; ok.value = ''; try { await $fetch('/api/services/billing-settings', { method: 'POST', body: f }); ok.value = 'Settings saved.'; await rs() } catch (e) { msg.value = err(e) } }
const blank = () => ({ id: '', code: '', name: '', description: '', billing: 'one_time', price: '' as string | number, price_ngn: '' as string | number, region: 'us', currency: 'USD', formation: false, active: true, sort: 10 })
const it = reactive(blank()); const editing = ref(false)
function edit(i?: Item) { Object.assign(it, blank(), i ? { ...i, description: i.description ?? '', price: i.price ?? '', price_ngn: i.price_ngn ?? '' } : {}); editing.value = true }
async function saveItem() { msg.value = ''; try { await $fetch('/api/services/catalog', { method: 'POST', body: { ...it, id: it.id || undefined } }); editing.value = false; await ri() } catch (e) { msg.value = err(e) } }
const BILL: Record<string, string> = { one_time: 'One-time', annual: 'Per year', monthly: 'Per month', quoted: 'Quoted (from)' }
const money = (v: string | null, c: string) => (v === null ? 'Set price' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(v)))
</script>

<template>
  <section v-if="s">
    <CsNav />
    <h1>Prices &amp; settings</h1>
    <div class="card link"><b>Formation sign-up page</b><span class="muted sm">Share this link or add it to your website. Prices come from the services marked "Offer in the formation sign-up".</span><a :href="formationUrl" target="_blank" rel="noopener">{{ formationUrl }}</a></div>
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
        <label class="label">Price (US$)<input v-model="it.price" inputmode="decimal" placeholder="Leave blank to set later"></label>
        <label class="label">Price (₦, for Nigerian companies)<input v-model="it.price_ngn" inputmode="decimal" placeholder="Leave blank to charge in US$"></label>
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
      <div v-if="isAdmin" class="wide row"><button class="btn" type="submit">Save settings</button><span class="muted sm">Bank details appear on invoices and in invoice emails for manual transfers.</span></div>
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
</style>
