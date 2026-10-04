<script setup lang="ts">
// Order Aidi's services in four steps: what you need, which services, details, review and pay.
const props = withDefaults(defineProps<{ preset?: string }>(), { preset: '' })
const emit = defineEmits<{ done: [jobId: string] }>()
interface It { code: string; name: string; description: string | null; price: number | null; currency: string; billing: string }
const { data } = await useFetch<{ items: It[]; companies: { id: string; name: string }[] }>('/api/portal/catalog', { key: 'portal:catalog' })
const CATS = [
  { key: 'address', title: 'Address and registered agent', blurb: 'A US mailing address, virtual office and registered agent for your company.', codes: ['virtual_office', 'de_mailbox', 'registered_agent'] },
  { key: 'start', title: 'Start a company', blurb: 'Form an LLC or C-Corp in the US, get your EIN and founding documents.', codes: ['llc_formation', 'inc_formation', 'ein', 'operating_agreement'] },
  { key: 'tax', title: 'Tax and annual filings', blurb: 'Federal returns, state franchise tax and annual reports, filed for you.', codes: ['irs_annual', 'de_franchise', 'ca_state'] },
  { key: 'other', title: 'Something else', blurb: 'Other filings, legal reviews or setup help.', codes: [] as string[] }]
const step = ref(1); const cat = ref(''); const picked = ref<string[]>([]); const company = ref(''); const notes = ref(''); const msg = ref(''); const busy = ref(false)
const done = ref<{ quoted: string[]; job_id: string } | null>(null)
const known = new Set(CATS.flatMap((c) => c.codes))
const inCat = computed(() => { const c = CATS.find((x) => x.key === cat.value); const all = data.value?.items ?? []; return c?.key === 'other' ? all.filter((i) => !known.has(i.code)) : all.filter((i) => c?.codes.includes(i.code)) })
watchEffect(() => { if (props.preset && data.value && !cat.value) { const c = CATS.find((x) => x.codes.includes(props.preset)); if (c) { cat.value = c.key; picked.value = [props.preset]; step.value = 2 } } })
const SYM: Record<string, string> = { USD: '$', NGN: '₦' }
const quoted = (i: It) => i.price == null || i.billing === 'quoted'
const price = (i: It) => quoted(i) ? (i.price ? 'From ' + (SYM[i.currency] ?? '') + i.price.toLocaleString('en-US') : 'Priced after review') : (SYM[i.currency] ?? '') + i.price!.toLocaleString('en-US') + (i.billing === 'monthly' ? ' / month' : i.billing === 'annual' ? ' / year' : ' one-off')
const chosen = computed(() => (data.value?.items ?? []).filter((i) => picked.value.includes(i.code)))
const lineAmount = (i: It) => (i.billing === 'monthly' ? 12 : 1) * (i.price ?? 0)
const total = computed(() => chosen.value.filter((i) => !quoted(i)).reduce((t, i) => t + lineAmount(i), 0))
const cur = computed(() => chosen.value[0]?.currency ?? 'USD')
function choose(k: string) { cat.value = k; step.value = 2 }
async function place() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ pay_url: string | null; quoted: string[]; job_id: string }>('/api/portal/order', { method: 'POST', body: { codes: picked.value, company_id: company.value || undefined, notes: notes.value } }); if (r.pay_url) window.location.href = r.pay_url; else { done.value = r; emit('done', r.job_id) } }
  catch (e) { msg.value = portalErr(e) } finally { busy.value = false }
}
</script>
<template>
  <div v-if="data" class="wz">
    <div v-if="done" class="fin"><span class="big">✓</span><h3>Order received</h3><p>We've opened a request for you{{ done.quoted.length ? ' and will send you a quote for ' + done.quoted.join(', ') : '' }}. You'll get an email as it moves, and you can follow it under Services.</p><NuxtLink :to="'/client/jobs/' + done.job_id" class="btn">View the request</NuxtLink></div>
    <template v-else>
      <ol class="steps"><li v-for="(s, i) in ['What you need', 'Services', 'Details', 'Review']" :key="s" :class="{ on: step === i + 1, ok: step > i + 1 }"><span>{{ step > i + 1 ? '✓' : i + 1 }}</span>{{ s }}</li></ol>
      <div v-if="step === 1" class="cats"><button v-for="c in CATS" :key="c.key" type="button" class="cat" @click="choose(c.key)"><b>{{ c.title }}</b><span>{{ c.blurb }}</span><em>Choose →</em></button></div>
      <div v-else-if="step === 2"><p class="hint">Pick one or more. You can add notes in the next step.</p>
        <div class="items"><label v-for="i in inCat" :key="i.code" class="it" :class="{ on: picked.includes(i.code) }"><input v-model="picked" type="checkbox" :value="i.code"><span class="nm">{{ i.name }}</span><span v-if="i.description" class="ds">{{ i.description }}</span><b :class="{ q: quoted(i) }">{{ price(i) }}</b></label>
          <p v-if="!inCat.length" class="hint">Nothing listed here yet. Go back and choose "Something else", or message us.</p></div></div>
      <div v-else-if="step === 3" class="det">
        <label v-if="data.companies.length" class="label">For which company?<select v-model="company"><option value="">Not specific, or a new company</option><option v-for="c in data.companies" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
        <label class="label">Anything we should know?<textarea v-model="notes" rows="5" maxlength="2000" placeholder="e.g. company name ideas, state, deadlines, documents you already have" /></label></div>
      <div v-else class="rev">
        <div v-for="i in chosen" :key="i.code" class="ln"><span>{{ i.name }}<em v-if="i.billing === 'monthly' && !quoted(i)"> · first 12 months</em></span><b>{{ quoted(i) ? 'Quote' : (SYM[i.currency] ?? '') + lineAmount(i).toLocaleString('en-US') }}</b></div>
        <div class="ln tot"><span>Due now</span><b>{{ total ? (SYM[cur] ?? '') + total.toLocaleString('en-US') : '—' }}</b></div>
        <p class="hint">{{ total ? 'Pay securely by card, or by bank transfer using the details on your invoice.' : 'We will review your request and send you a quote.' }}{{ chosen.some(quoted) && total ? ' Quoted items are priced after review.' : '' }}</p></div>
      <p v-if="msg" class="error">{{ msg }}</p>
      <div class="nav"><button v-if="step > 1" type="button" class="btn secondary" @click="step--">Back</button><span />
        <button v-if="step === 2" type="button" class="btn" :disabled="!picked.length" @click="step = 3">Continue</button>
        <button v-else-if="step === 3" type="button" class="btn" @click="step = 4">Review</button>
        <button v-else-if="step === 4" type="button" class="btn" :disabled="busy" @click="place">{{ busy ? 'Placing order…' : total ? 'Pay ' + (SYM[cur] ?? '') + total.toLocaleString('en-US') : 'Request a quote' }}</button></div>
    </template>
  </div>
</template>
<style scoped>
.steps { display: flex; gap: 18px; list-style: none; padding: 0; margin: 0 0 18px; font-size: 13px; color: var(--c-muted); flex-wrap: wrap; } .steps li { display: flex; align-items: center; gap: 7px; }
.steps span { width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid var(--c-rule-strong); font-size: 12px; } .steps .on { color: var(--c-navy); font-weight: 500; } .steps .on span { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .steps .ok span { color: var(--c-ok); border-color: var(--c-ok); }
.cats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .cat { text-align: left; background: #fff; border: 1px solid var(--c-rule); padding: 18px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 6px; } .cat:hover { border-color: var(--c-navy); }
.cat b { font-family: var(--font-heading); font-weight: 500; font-size: 21px; color: var(--c-navy); } .cat span { font-size: 13.5px; color: var(--c-ink-soft); } .cat em { font-style: normal; font-size: 13px; color: var(--c-blue-deep); margin-top: 6px; }
.items { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .it { border: 1px solid var(--c-rule); padding: 14px; display: flex; flex-direction: column; gap: 5px; cursor: pointer; position: relative; } .it.on { border-color: var(--c-navy); box-shadow: inset 0 0 0 1px var(--c-navy); background: #f7f9fc; }
.it input { position: absolute; top: 14px; right: 14px; } .nm { font-weight: 600; padding-right: 26px; } .ds { font-size: 12.5px; color: var(--c-ink-soft); } .it b { font-weight: 600; margin-top: 4px; } .it b.q { color: var(--c-muted); font-weight: 500; }
.det { display: flex; flex-direction: column; gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; } select, textarea { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.ln { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--c-rule); font-size: 14.5px; } .ln em { font-style: normal; color: var(--c-muted); font-size: 12.5px; } .ln.tot { font-size: 17px; font-weight: 600; border-bottom: 0; }
.hint { font-size: 13px; color: var(--c-muted); margin: 0 0 10px; } .nav { display: flex; gap: 10px; align-items: center; margin-top: 18px; } .nav span { flex: 1; } .error { color: var(--c-danger); }
.fin { text-align: center; padding: 10px 0; } .fin .big { display: inline-grid; place-items: center; width: 52px; height: 52px; background: rgba(31,122,77,.12); color: var(--c-ok); font-size: 26px; } .fin h3 { font-size: 24px; margin: 12px 0 6px; } .fin p { color: var(--c-ink-soft); max-width: 440px; margin: 0 auto 16px; } .fin a { text-decoration: none; }
@media (max-width: 640px) { .cats, .items { grid-template-columns: 1fr; } }
</style>
