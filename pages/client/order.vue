<script setup lang="ts">
// Order Aidi's services: virtual office and mailbox, registered agent, company formation, EIN, tax filings.
useHead({ title: 'Order a service' })
interface It { code: string; name: string; description: string | null; price: number | null; currency: string; billing: string }
const { data } = await usePortalFetch<{ items: It[]; companies: { id: string; name: string }[] }>('/api/portal/catalog')
const picked = ref<string[]>([]); const company = ref(''); const notes = ref(''); const msg = ref(''); const done = ref<{ quoted: string[]; job_id: string } | null>(null); const busy = ref(false)
const SYM: Record<string, string> = { USD: '$', NGN: '₦' }
const price = (i: It) => i.price == null || i.billing === 'quoted' ? (i.price ? 'From ' + (SYM[i.currency] ?? '') + i.price.toLocaleString('en-US') + ' · quoted' : 'Quoted') : (SYM[i.currency] ?? '') + i.price.toLocaleString('en-US') + (i.billing === 'monthly' ? ' / month' : i.billing === 'annual' ? ' / year' : '')
const total = computed(() => (data.value?.items ?? []).filter((i) => picked.value.includes(i.code) && i.price != null && i.billing !== 'quoted').reduce((t, i) => t + (i.billing === 'monthly' ? 12 : 1) * (i.price ?? 0), 0))
const cur = computed(() => (data.value?.items ?? []).find((i) => picked.value.includes(i.code))?.currency ?? 'USD')
const GROUPS: [string, string[]][] = [['Address and registered agent', ['virtual_office', 'de_mailbox', 'registered_agent']], ['Start a company', ['llc_formation', 'inc_formation', 'ein', 'operating_agreement']], ['Tax and annual filings', ['irs_annual', 'de_franchise', 'ca_state']]]
const grouped = computed(() => { const all = data.value?.items ?? []; const used = new Set(GROUPS.flatMap(([, c]) => c)); return [...GROUPS.map(([t, codes]) => [t, all.filter((i) => codes.includes(i.code))] as const), ['Other services', all.filter((i) => !used.has(i.code))] as const].filter(([, l]) => l.length) })
async function order() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ pay_url: string | null; quoted: string[]; job_id: string }>('/api/portal/order', { method: 'POST', body: { codes: picked.value, company_id: company.value || undefined, notes: notes.value } }); if (r.pay_url) window.location.href = r.pay_url; else done.value = r }
  catch (e) { msg.value = portalErr(e) } finally { busy.value = false }
}
</script>
<template>
  <section v-if="data">
    <ClientTabs />
    <h1>Order a service</h1>
    <p class="lead">Done for you by the Aidi team. Pick what you need; listed prices are paid online by card or by bank transfer, and quoted services are priced after we review your details.</p>
    <div v-if="done" class="card okc"><b>Order received.</b><p>We have opened a request for you{{ done.quoted.length ? ' and will send a quote for ' + done.quoted.join(', ') : '' }}. Follow it under Services.</p><NuxtLink :to="'/client/jobs/' + done.job_id" class="btn">View the request</NuxtLink></div>
    <template v-else>
      <div v-for="[title, items] in grouped" :key="title" class="grp"><h2>{{ title }}</h2>
        <div class="cards"><label v-for="i in items" :key="i.code" class="it" :class="{ on: picked.includes(i.code) }"><input v-model="picked" type="checkbox" :value="i.code"><span class="nm">{{ i.name }}</span><span v-if="i.description" class="ds">{{ i.description }}</span><b>{{ price(i) }}</b></label></div></div>
      <div class="card sum">
        <label v-if="data.companies.length" class="label">For which company?<select v-model="company"><option value="">Not specific / new company</option><option v-for="c in data.companies" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
        <label class="label">Anything we should know?<textarea v-model="notes" rows="3" maxlength="2000" placeholder="e.g. company name ideas, state, deadlines" /></label>
        <div class="row"><span>{{ picked.length }} selected · <b>{{ total ? (SYM[cur] ?? '') + total.toLocaleString('en-US') : 'Quote' }}</b> due now</span><button class="btn" :disabled="!picked.length || busy" @click="order">{{ busy ? 'Placing order…' : total ? 'Continue to payment' : 'Request a quote' }}</button></div>
        <p v-if="msg" class="error">{{ msg }}</p></div>
    </template>
  </section>
</template>
<style scoped>
.lead { color: var(--c-ink-soft); max-width: 760px; } .grp h2 { font-size: 20px; margin: 20px 0 10px; } .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.it { background: #fff; border: 1px solid var(--c-rule); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; position: relative; } .it.on { border-color: var(--c-navy); box-shadow: inset 0 0 0 1px var(--c-navy); } .it input { position: absolute; top: 14px; right: 14px; }
.nm { font-family: var(--font-heading); font-size: 20px; color: var(--c-navy); padding-right: 24px; } .ds { font-size: 13px; color: var(--c-ink-soft); } .it b { font-weight: 600; margin-top: auto; }
.sum { margin-top: 18px; display: flex; flex-direction: column; gap: 10px; position: sticky; bottom: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; } select, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; } .okc p { color: var(--c-ink-soft); } .okc a { text-decoration: none; } .error { color: var(--c-danger); }
</style>
