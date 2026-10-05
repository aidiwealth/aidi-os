<script setup lang="ts">
import { US_STATES } from '~/shared/countries'
// Order Aidi's services in four steps: what you need, which services, details, review and pay.
const props = withDefaults(defineProps<{ preset?: string }>(), { preset: '' })
const emit = defineEmits<{ done: [jobId: string] }>()
interface It { code: string; name: string; description: string | null; price: number | null; currency: string; billing: string }
const { data } = await useFetch<{ items: It[]; companies: { id: string; name: string; entity_type: string | null; state: string | null; country: string | null; status: string }[] }>('/api/portal/catalog', { key: 'portal:catalog' })
const CATS = [
  { key: 'address', title: 'Address and registered agent', blurb: 'A US mailing address, virtual office and registered agent for your company.', codes: ['virtual_office', 'de_mailbox', 'registered_agent'] },
  { key: 'start', title: 'Start a company', blurb: 'Form an LLC or C-Corp in the US, get your EIN and founding documents.', codes: ['llc_formation', 'inc_formation', 'ein', 'operating_agreement'] },
  { key: 'tax', title: 'Tax and annual filings', blurb: 'Federal returns, state franchise tax and annual reports, filed for you.', codes: ['irs_annual', 'de_franchise', 'ca_state'] },
  { key: 'other', title: 'Something else', blurb: 'Other filings, legal reviews or setup help.', codes: [] as string[] }]
const step = ref(1); const cat = ref(''); const picked = ref<string[]>([]); const company = ref(''); const notes = ref(''); const msg = ref(''); const busy = ref(false)
const done = ref<{ quoted: string[]; job_id: string } | null>(null)
const { data: wal } = await useFetch<{ currency: string; balance_minor: number } | null>('/api/portal/wallet', { key: 'portal:wallet' })
const useWallet = ref(false)
const walletCovers = computed(() => !!wal.value && wal.value.currency === cur.value && wal.value.balance_minor >= total.value * 100 && total.value > 0)
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
const forming = computed(() => picked.value.some((c) => c === 'llc_formation' || c === 'inc_formation'))
const nf = reactive({ name: '', alt_name: '', country: 'United States', state: 'Delaware', entity_type: 'llc' as 'llc' | 'c_corp' })
watch(picked, (p) => { if (p.includes('inc_formation') && !p.includes('llc_formation')) nf.entity_type = 'c_corp'; else if (p.includes('llc_formation')) nf.entity_type = 'llc' })
const sel = computed(() => data.value?.companies.find((c) => c.id === company.value) ?? null)
const cp = reactive({ country: 'United States', state: '' })
watch(sel, (s) => { cp.country = s?.country || 'United States'; cp.state = s?.state || '' })
interface NR { status: string; issues: string[]; matches: { name: string; status: string | null; incorporated: string | null; exact: boolean; source: string }[]; register_checked: boolean; official_search: string | null; suggestion: string }
const nr = ref<NR | null>(null); const checking = ref(false)
watch(() => [nf.name, nf.state, nf.entity_type], () => { nr.value = null })
async function checkName() { checking.value = true; msg.value = ''; try { nr.value = await $fetch<NR>('/api/portal/name-check', { method: 'POST', body: { name: nf.name, state: nf.state, type: nf.entity_type === 'llc' ? 'llc' : 'corp' } }) } catch (e) { msg.value = portalErr(e) } finally { checking.value = false } }
const isUS = computed(() => /^united states$/i.test(nf.country))
const detailsOk = computed(() => !forming.value ? (!sel.value || (cp.country && (!/^united states$/i.test(cp.country) || cp.state))) : nf.name.trim().length > 1 && nf.country && (!isUS.value || nf.state) && nr.value?.status !== 'taken')
const ICON: Record<string, string> = { address: 'customers', start: 'entities', tax: 'compliance', other: 'company_services' }
const catItems = (k: string) => { const c = CATS.find((x) => x.key === k); const all = data.value?.items ?? []; return k === 'other' ? all.filter((i) => !known.has(i.code)) : all.filter((i) => c?.codes.includes(i.code)) }
const catFrom = (k: string) => { const p = catItems(k).filter((i) => i.price != null).map((i) => i.price as number); if (!p.length) return 'Priced after review'; const c = catItems(k).find((i) => i.price != null)!.currency; return 'From ' + (SYM[c] ?? '') + Math.min(...p).toLocaleString('en-US') }
const toggle = (code: string) => { picked.value = picked.value.includes(code) ? picked.value.filter((x) => x !== code) : [...picked.value, code] }
const STEPS = ['What you need', 'Services', 'Details', 'Review & pay']
const catTitle = computed(() => CATS.find((x) => x.key === cat.value)?.title ?? '')
async function place() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ pay_url: string | null; invoice_id: string | null; quoted: string[]; job_id: string }>('/api/portal/order', { method: 'POST', body: { codes: picked.value, company_id: forming.value ? undefined : company.value || undefined, notes: notes.value, formation: forming.value ? { ...nf, name_status: nr.value?.status ?? 'not checked' } : undefined, company_place: !forming.value && sel.value && (!sel.value.state || !sel.value.country) ? cp : undefined } })
    if (r.invoice_id && useWallet.value && walletCovers.value) { await $fetch('/api/portal/invoices/' + r.invoice_id + '/pay-wallet', { method: 'POST' }); done.value = r; emit('done', r.job_id) }
    else if (r.pay_url) window.location.href = r.pay_url; else { done.value = r; emit('done', r.job_id) } }
  catch (e) { msg.value = portalErr(e) } finally { busy.value = false }
}
</script>
<template>
  <div v-if="data" class="oz">
    <div v-if="done" class="fin"><span class="ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span><h3>Order received</h3><p>We've opened a request for you{{ done.quoted.length ? ' and will send you a quote for ' + done.quoted.join(', ') : '' }}. You'll get an email as it moves, and you can follow it under Services.</p><NuxtLink :to="'/client/jobs/' + done.job_id" class="btn">View the request</NuxtLink></div>
    <template v-else>
      <div class="prog"><div class="pl"><i :style="{ width: ((step - 1) / 3) * 100 + '%' }" /></div><ol><li v-for="(s, i) in STEPS" :key="s" :class="{ on: step === i + 1, ok: step > i + 1 }" @click="step > i + 1 && (step = i + 1)"><span>{{ step > i + 1 ? '✓' : i + 1 }}</span>{{ s }}</li></ol></div>
      <div v-if="step === 1" class="cats">
        <button v-for="c in CATS" :key="c.key" type="button" class="cat" @click="choose(c.key)"><span class="ci"><AppIcon :name="ICON[c.key] ?? 'company_services'" /></span><span class="ct"><b>{{ c.title }}</b><span>{{ c.blurb }}</span></span>
          <span class="cf"><em v-if="catItems(c.key).length">{{ catItems(c.key).length }} service{{ catItems(c.key).length === 1 ? '' : 's' }}</em><em v-else>Tell us what you need</em><strong>{{ catFrom(c.key) }}</strong></span><svg class="go" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m8 5 5 5-5 5" /></svg></button></div>
      <div v-else class="body2">
        <div class="mainc">
          <template v-if="step === 2"><h3>{{ catTitle }}</h3><p class="hint">Pick one or more. You can add notes in the next step.</p>
            <div class="items"><button v-for="i in inCat" :key="i.code" type="button" class="it" :class="{ on: picked.includes(i.code) }" @click="toggle(i.code)"><span class="ck"><svg v-if="picked.includes(i.code)" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 10.5 3.5 3.5L15 7" /></svg></span>
              <span class="itx"><b>{{ i.name }}</b><span v-if="i.description">{{ i.description }}</span></span><span class="pr" :class="{ q: quoted(i) }">{{ price(i) }}</span></button>
              <EmptyState v-if="!inCat.length" icon="company_services" title="Nothing listed here yet" text="Go back and choose “Something else”, or message us." /></div></template>
          <div v-else-if="step === 3" class="det"><h3>A few details</h3>
            <template v-if="forming">
              <p class="hint">Your new company. We file in the state you choose; Delaware and Wyoming are popular for startups, or pick the state where you operate.</p>
              <div class="g2"><label class="label">Company type<select v-model="nf.entity_type"><option value="llc">LLC</option><option value="c_corp">C-Corp (Inc.)</option></select></label>
                <label class="label">Country<CountrySelect v-model="nf.country" /></label>
                <label v-if="isUS" class="label">State<select v-model="nf.state"><option v-for="s in US_STATES" :key="s" :value="s">{{ s }}</option></select></label>
                <label class="label">Backup name (optional)<input v-model="nf.alt_name" maxlength="200" placeholder="In case the first is taken"></label></div>
              <label class="label">Company name<span class="nrow"><input v-model="nf.name" maxlength="200" :placeholder="nf.entity_type === 'llc' ? 'e.g. Acme Labs LLC' : 'e.g. Acme Labs Inc.'"><button v-if="isUS" type="button" class="btn secondary" :disabled="nf.name.trim().length < 2 || checking" @click="checkName">{{ checking ? 'Checking…' : 'Check name' }}</button></span></label>
              <div v-if="nr" class="nres" :class="nr.status"><b>{{ { available: 'Looks available', taken: 'Already taken', similar: 'Similar names exist', unknown: 'Check with the state' }[nr.status] }}</b><span>{{ nr.suggestion }}</span>
                <span v-for="(i, k) in nr.issues" :key="'i' + k" class="iss">{{ i }}</span>
                <span v-for="(m, k) in nr.matches" :key="'m' + k" class="mt">{{ m.name }}{{ m.status ? ' · ' + m.status : '' }}{{ m.incorporated ? ' · ' + m.incorporated : '' }}{{ m.exact ? ' · exact match' : '' }}</span>
                <a v-if="nr.official_search" :href="nr.official_search" target="_blank" rel="noopener">Search the {{ nf.state }} register yourself →</a></div>
            </template>
            <template v-else-if="data.companies.length">
              <label class="label">For which company?<select v-model="company"><option value="">Not specific</option><option v-for="c in data.companies" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
              <p v-if="sel && sel.state && sel.country" class="hint">Filings for {{ sel.name }} go to {{ sel.state }}, {{ sel.country }} (from your records).</p>
              <div v-else-if="sel" class="g2"><p class="hint w2">Tell us where {{ sel.name }} is registered. We save it for future filings.</p><label class="label">Country<CountrySelect v-model="cp.country" /></label><label v-if="/^united states$/i.test(cp.country)" class="label">State<select v-model="cp.state"><option value="" disabled>Choose</option><option v-for="s in US_STATES" :key="s" :value="s">{{ s }}</option></select></label></div>
            </template>
            <label class="label">Anything we should know?<textarea v-model="notes" rows="6" maxlength="2000" placeholder="e.g. company name ideas, state, deadlines, documents you already have" /></label></div>
          <div v-else class="rev"><h3>Review and pay</h3><ServiceNotice compact />
            <div v-if="total" class="pays"><button v-if="walletCovers" type="button" class="pay" :class="{ on: useWallet }" @click="useWallet = true"><AppIcon name="wallet" /><span><b>Wallet</b><em>Balance {{ (SYM[wal!.currency] ?? '') + (wal!.balance_minor / 100).toLocaleString('en-US') }}</em></span></button>
              <button type="button" class="pay" :class="{ on: !useWallet || !walletCovers }" @click="useWallet = false"><AppIcon name="billing" /><span><b>Card or bank transfer</b><em>Secure checkout, or pay from your invoice</em></span></button></div>
            <p class="hint">{{ total ? (chosen.some(quoted) ? 'Quoted items are priced after review and invoiced separately.' : 'You will get a receipt by email.') : 'We will review your request and send you a quote.' }}</p></div>
        </div>
        <aside class="sum"><p class="sl">Your order</p>
          <div v-for="i in chosen" :key="i.code" class="ln"><span>{{ i.name }}<em v-if="i.billing === 'monthly' && !quoted(i)">First 12 months</em><em v-else-if="quoted(i)">Quoted after review</em></span><b>{{ quoted(i) ? '—' : (SYM[i.currency] ?? '') + lineAmount(i).toLocaleString('en-US') }}</b></div>
          <p v-if="!chosen.length" class="emp">Nothing selected yet.</p>
          <div class="tot"><span>Due now</span><b>{{ total ? (SYM[cur] ?? '') + total.toLocaleString('en-US') : '—' }}</b></div>
          <button v-if="step === 2" type="button" class="btn full" :disabled="!picked.length" @click="step = 3">Continue</button>
          <button v-else-if="step === 3" type="button" class="btn full" :disabled="!detailsOk" @click="step = 4">Review order</button>
          <button v-else-if="step === 4" type="button" class="btn full" :disabled="busy" @click="place">{{ busy ? 'Placing order…' : total ? (useWallet && walletCovers ? 'Pay from wallet · ' : 'Pay ') + (SYM[cur] ?? '') + total.toLocaleString('en-US') : 'Request a quote' }}</button>
          <button type="button" class="back" @click="step--">← Back</button>
          <p v-if="msg" class="error">{{ msg }}</p></aside>
      </div>
    </template>
  </div>
</template>
<style scoped>
.prog { margin: 0 0 22px; } .pl { height: 3px; background: var(--c-paper-2); margin-bottom: 12px; } .pl i { display: block; height: 100%; background: var(--c-navy); transition: width .25s ease; }
.prog ol { display: flex; justify-content: space-between; list-style: none; padding: 0; margin: 0; font-size: 13px; color: var(--c-muted); } .prog li { display: flex; align-items: center; gap: 8px; } .prog li.ok { cursor: pointer; color: var(--c-ink-soft); }
.prog span { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; border: 1.5px solid var(--c-rule-strong); font-size: 12px; font-weight: 600; background: #fff; } .prog .on { color: var(--c-ink); font-weight: 600; } .prog .on span { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .prog .ok span { background: var(--c-ok); border-color: var(--c-ok); color: #fff; }
.cats { display: flex; flex-direction: column; gap: 10px; } .cat { display: flex; align-items: center; gap: 16px; text-align: left; background: #fff; border: 1px solid var(--c-rule); padding: 18px 20px; font: inherit; cursor: pointer; transition: border-color .12s, box-shadow .12s, transform .12s; }
.cat:hover { border-color: var(--c-navy); box-shadow: 0 8px 24px rgba(12,26,46,.08); transform: translateY(-1px); } .ci { width: 48px; height: 48px; border-radius: 12px; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; flex: none; } .ci :deep(svg) { width: 24px; height: 24px; }
.ct { flex: 1; display: flex; flex-direction: column; gap: 3px; } .ct b { font-size: 16.5px; font-weight: 600; color: var(--c-ink); letter-spacing: -.01em; } .ct span { font-size: 13.5px; color: var(--c-ink-soft); }
.cf { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; white-space: nowrap; } .cf em { font-style: normal; font-size: 12px; color: var(--c-muted); } .cf strong { font-size: 14px; font-weight: 600; color: var(--c-ink); } .go { width: 18px; height: 18px; color: var(--c-muted); flex: none; }
.body2 { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; } .mainc h3 { font-size: 18px; margin: 0 0 4px; } .hint { font-size: 13px; color: var(--c-muted); margin: 0 0 14px; }
.items { display: flex; flex-direction: column; gap: 8px; } .it { display: flex; align-items: flex-start; gap: 14px; text-align: left; background: #fff; border: 1px solid var(--c-rule); padding: 15px 16px; font: inherit; cursor: pointer; transition: border-color .12s, background .12s; }
.it:hover { border-color: var(--c-rule-strong); } .it.on { border-color: var(--c-navy); background: #f6f8fb; box-shadow: inset 0 0 0 1px var(--c-navy); } .ck { width: 20px; height: 20px; border: 1.5px solid var(--c-rule-strong); border-radius: 6px; display: grid; place-items: center; flex: none; margin-top: 1px; background: #fff; }
.it.on .ck { background: var(--c-navy); border-color: var(--c-navy); color: #fff; } .ck svg { width: 14px; height: 14px; } .itx { flex: 1; display: flex; flex-direction: column; gap: 3px; } .itx b { font-weight: 600; font-size: 14.5px; color: var(--c-ink); } .itx span { font-size: 13px; color: var(--c-ink-soft); line-height: 1.45; }
.pr { font-weight: 600; font-size: 14px; white-space: nowrap; color: var(--c-ink); } .pr.q { color: var(--c-muted); font-weight: 500; font-size: 13px; }
.det { display: flex; flex-direction: column; gap: 14px; } label.label { display: flex; flex-direction: column; gap: 6px; } select, textarea { font: inherit; font-size: 14px; padding: 10px 12px; border: 1px solid var(--c-rule-strong); background: #fff; }
.pays { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 6px 0 12px; } .pay { display: flex; gap: 12px; align-items: center; text-align: left; background: #fff; border: 1px solid var(--c-rule); padding: 14px; font: inherit; cursor: pointer; } .pay.on { border-color: var(--c-navy); box-shadow: inset 0 0 0 1px var(--c-navy); background: #f6f8fb; }
.pay :deep(svg) { width: 22px; height: 22px; color: var(--c-blue-deep); flex: none; } .pay span { display: flex; flex-direction: column; } .pay b { font-size: 14px; } .pay em { font-style: normal; font-size: 12px; color: var(--c-muted); }
.sum { background: #fbfaf7; border: 1px solid var(--c-rule); padding: 18px; position: sticky; top: 10px; display: flex; flex-direction: column; gap: 4px; } .sl { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--c-muted); margin: 0 0 8px; }
.ln { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--c-rule); font-size: 13.5px; } .ln span { display: flex; flex-direction: column; } .ln em { font-style: normal; font-size: 11.5px; color: var(--c-muted); } .ln b { font-weight: 600; white-space: nowrap; }
.emp { font-size: 13px; color: var(--c-muted); margin: 0 0 6px; } .tot { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 0 14px; } .tot span { font-size: 13.5px; color: var(--c-ink-soft); } .tot b { font-size: 22px; font-weight: 700; letter-spacing: -.02em; }
.btn.full { width: 100%; height: 44px; font-size: 14.5px; font-weight: 600; } .back { background: none; border: 0; font: inherit; font-size: 13px; color: var(--c-muted); cursor: pointer; margin-top: 8px; } .back:hover { color: var(--c-ink); } .error { color: var(--c-danger); font-size: 13px; }
.fin { text-align: center; padding: 18px 0; } .fin .ok { display: inline-grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: rgba(31,122,77,.12); color: var(--c-ok); } .fin .ok svg { width: 30px; height: 30px; } .fin h3 { font-size: 22px; margin: 14px 0 6px; } .fin p { color: var(--c-ink-soft); max-width: 440px; margin: 0 auto 18px; } .fin a { text-decoration: none; }
@media (max-width: 820px) { .body2 { grid-template-columns: 1fr; } .sum { position: static; } .prog ol li:not(.on) { font-size: 0; gap: 0; } .cf { display: none; } .pays { grid-template-columns: 1fr; } }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .w2 { grid-column: 1 / -1; margin: 0; } .nrow { display: flex; gap: 8px; } .nrow input { flex: 1; }
.nres { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--c-rule); background: #fbfaf7; font-size: 13px; } .nres b { font-size: 14px; } .nres.available { border-color: rgba(31,122,77,.35); background: rgba(31,122,77,.06); } .nres.available b { color: var(--c-ok); } .nres.taken { border-color: rgba(180,35,24,.35); background: rgba(180,35,24,.05); } .nres.taken b { color: var(--c-danger); } .nres.similar b, .nres.unknown b { color: var(--c-warn); }
.nres .iss { color: var(--c-warn); } .nres .mt { color: var(--c-ink-soft); font-size: 12.5px; } .nres a { color: var(--c-blue-deep); margin-top: 4px; }
</style>
