<script setup lang="ts">
import { isNigeria, MARKETS, localCardCountry, LOCAL_CARD_NOTE } from '~/shared/countries'
import { PLAN_FEATS } from '~/shared/plans'
// Finvry sign-up: you, your company and country, a plan (naira for Nigeria, dollars elsewhere), then the emailed code.
// While sign-up is by invitation, this page is the request-access form, unless the link carries an invitation or the
// person has a partner or community code.
definePageMeta({ layout: false })
useHead({ title: 'Create your Finvry account' })
const brand = useBrand()
interface Plan { code: string; name: string; description: string; seat_limit: number | null; usd: number | null; ngn: number | null; usd_year: number | null; ngn_year: number | null }
const inviteTok = String(useRoute().query.invite ?? '')
const { data } = await useFetch<{ plans: Plan[]; mode?: 'invite_only' | 'open' | 'closed'; invite?: { name: string; email: string; company: string; country: string } | false | null }>('/api/public/signup', { query: inviteTok ? { invite: inviteTok } : {} })
const step = ref(1)
const f = reactive({ website: '', name: '', email: '', company: '', country: 'United States', entity_type: '', state: 'Delaware', plan: 'company_startup', code: '' })
const inv = computed(() => data.value?.invite || null)
if (inv.value) Object.assign(f, { name: inv.value.name, email: inv.value.email, company: inv.value.company, country: inv.value.country })
const TYPES = computed<Record<string, string>>(() => ({ us_llc: 'LLC (United States)', us_corp: 'C-Corp / Inc (United States)', ...(isNigeria(f.country) ? { ng_ltd: 'Limited company (Nigeria)' } : {}), ...(!isNigeria(f.country) && !/^united states$/i.test(f.country) ? { local: 'Company registered in ' + f.country } : {}), other: 'Not formed yet' }))
// Country: six named markets as tiles, everything else under "Other".
const market = ref<string>('United States')
watch(market, (m) => { if (m !== 'Other') f.country = m; else if (MARKETS.some((x) => x.name === f.country)) f.country = '' })
const cardNote = computed(() => localCardCountry(f.country))
const setup = computed(() => isNigeria(f.country)
  ? ['Billed in naira (₦), with card, transfer or your Finvry wallet', 'Nigerian company services and filings, priced in naira, plus US company formation', 'Filing reminders for Nigerian companies']
  : /^united states$/i.test(f.country)
    ? ['Billed in US dollars', 'US company services: formation, EIN, registered agent and state filings', 'Delaware and state filing reminders']
    : ['Billed in US dollars — pay with your local card; our payment processor converts', 'US company services: form a Delaware or Wyoming company, EIN, registered agent', 'Investor tools work the same in every country'])
const STEPS = [{ t: 'About you', d: 'Your name and work email' }, { t: 'Your company', d: 'Name, country and type' }, { t: 'Choose a plan', d: '14-day free trial on every plan' }, { t: 'Verify your email', d: 'Enter the 6-digit code' }]
const FEATS = PLAN_FEATS
const ngn = computed(() => isNigeria(f.country))
const amount = (p: Plan) => { const v = ngn.value ? p.ngn : p.usd; return v === null ? 'Contact us' : (ngn.value ? '₦' : '$') + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) }
const yearly = (p: Plan) => { const v = ngn.value ? p.ngn_year : p.usd_year; return v ? (ngn.value ? '₦' : '$') + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' billed yearly' : '' }
const msg = ref(''); const busy = ref(false)
const hc = ref<{ fresh: () => Promise<string> } | null>(null), human = ref(''), humanReady = ref(false)
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Please try again.' }
function next() { msg.value = ''; if (step.value === 1 && (!f.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))) { msg.value = 'Add your name and a valid email.'; return } if (step.value === 2 && !f.company.trim()) { msg.value = 'Add your company name.'; return } if (step.value === 2 && !f.country) { msg.value = 'Choose your country.'; return } step.value++ }
watch(() => f.country, () => { if (f.entity_type && !(f.entity_type in TYPES.value)) f.entity_type = '' })
// Terms of Service and Data Privacy Agreement (Nigerian or California/US versions by country), signed with the account.
const agDocs = ref<{ code: string; title: string; md: string }[]>([])
const agree = ref({ name: '', kind: 'typed' as 'typed' | 'drawn' | 'uploaded', png: '', agree: false })
const agreed = computed(() => agree.value.name.trim().length > 1 && !!agree.value.png && agree.value.agree)
async function loadAgreements() { try { const r = await $fetch<{ docs: { code: string; title: string; md: string }[] }>('/api/public/agreements', { query: { country: f.country, company: f.company, name: f.name, email: f.email } }); agDocs.value = r.docs; if (!agree.value.name) agree.value.name = f.name } catch { agDocs.value = [] } }
watch(step, (v) => { if (v === 3) loadAgreements() })
// Partner code (from a VC, incubator, accelerator or community): checked, then applied to the new workspace.
const pc = reactive({ code: String(useRoute().query.partner ?? useRoute().query.code ?? ''), ok: null as null | { partner: string; pct: number; months: number | null }, err: '', busy: false, open: false })
if (pc.code) pc.open = true
async function checkCode() { pc.busy = true; pc.err = ''; pc.ok = null; try { pc.ok = await $fetch('/api/public/partners/check', { method: 'POST', body: { code: pc.code } }); gateCode.value = pc.code } catch (e) { pc.err = err(e) } finally { pc.busy = false } }
onMounted(() => { if (pc.code) checkCode() })
async function create() { busy.value = true; msg.value = ''; try { const tt = await hc.value?.fresh(); await $fetch<{ emailed: boolean }>('/api/public/signup', { method: 'POST', body: { invite: inv.value ? inviteTok : undefined, turnstile_token: tt || undefined, website: f.website, name: f.name, email: f.email, company: f.company, country: f.country, entity_type: f.entity_type === 'local' ? 'other' : f.entity_type || undefined, state: f.entity_type === 'us_llc' || f.entity_type === 'us_corp' ? f.state : undefined, plan: f.plan, agree: agree.value, partner_code: pc.ok ? pc.code : undefined } }); step.value = 4; startCooldown(); await nextTick(); boxes.value[0]?.focus() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
// six code boxes: type, paste, backspace
const digits = ref<string[]>(['', '', '', '', '', '']); const boxes = ref<HTMLInputElement[]>([])
function onDigit(i: number, e: Event) { const v = (e.target as HTMLInputElement).value.replace(/\D/g, ''); if (v.length > 1) { fill(v); return } digits.value[i] = v; if (v && i < 5) boxes.value[i + 1]?.focus(); sync() }
function onKey(i: number, e: KeyboardEvent) { if (e.key === 'Backspace' && !digits.value[i] && i > 0) boxes.value[i - 1]?.focus() }
function fill(v: string) { const s = v.replace(/\D/g, '').slice(0, 6).split(''); digits.value = [...s, ...Array(6 - s.length).fill('')]; boxes.value[Math.min(s.length, 5)]?.focus(); sync() }
function onPaste(e: ClipboardEvent) { e.preventDefault(); fill(e.clipboardData?.getData('text') ?? '') }
function sync() { f.code = digits.value.join(''); if (f.code.length === 6 && !busy.value) verify() }
async function verify() { busy.value = true; msg.value = ''; try { await $fetch('/api/auth/verify-otp', { method: 'POST', body: { email: f.email, code: f.code } }); await navigateTo('/') } catch (e) { msg.value = err(e); digits.value = ['', '', '', '', '', '']; f.code = ''; boxes.value[0]?.focus() } finally { busy.value = false } }
const cool = ref(0); let t: ReturnType<typeof setInterval> | null = null
function startCooldown() { cool.value = 30; if (t) clearInterval(t); t = setInterval(() => { cool.value--; if (cool.value <= 0 && t) clearInterval(t) }, 1000) }
async function resend() { msg.value = ''; try { const tt = await hc.value?.fresh(); await $fetch('/api/auth/request', { method: 'POST', body: { email: f.email, turnstile_token: tt || undefined } }); startCooldown() } catch (e) { msg.value = err(e) } }
onBeforeUnmount(() => { if (t) clearInterval(t) })
const pct = computed(() => Math.round(((step.value - 1) / 3) * 100))
// Invite-only: the request form, unless there is an invitation or a partner code (which skips the queue).
const gateCode = ref('')
const gated = computed(() => (data.value?.mode ?? 'open') !== 'open' && !inv.value && !(data.value?.mode === 'invite_only' && pc.ok && gateCode.value))
const NEEDS: [string, string][] = [['reporting', 'Financial reporting'], ['investors', 'Investor updates and relations'], ['fundraising', 'Fundraising and data room'], ['cap_table', 'Cap table and SAFEs'], ['forecast', 'Forecasts'], ['customers', 'Customer and revenue analysis'], ['group', 'A group with subsidiaries'], ['compliance', 'Compliance and filings'], ['services', 'Company services (formation, bookkeeping)']]
const SOURCES = ['A startup community', 'My VC, accelerator or incubator', 'Search', 'LinkedIn or X', 'A friend or colleague', 'An event', 'Other']
const ra = reactive({ name: '', email: '', company: '', website: '', country: 'United States', stage: '', team_size: '', needs: [] as string[], needs_note: '', source: '', community: '', want_demo: false, hp: '' })
const raDone = ref<'' | 'sent' | 'already' | 'open'>(''), raBusy = ref(false), codeOpen = ref(false)
async function requestAccess() {
  msg.value = ''
  if (!ra.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ra.email) || !ra.company.trim() || !ra.country || !ra.stage || !ra.team_size || !ra.needs.length) { msg.value = 'Fill in your name, work email, company, country, stage, team size and at least one thing you need.'; return }
  raBusy.value = true
  try { const tt = await hc.value?.fresh(); const r = await $fetch<{ open?: boolean; already?: boolean }>('/api/public/access-request', { method: 'POST', body: { turnstile_token: tt || undefined, website_hp: ra.hp, name: ra.name, email: ra.email, company: ra.company, website: ra.website, country: ra.country, stage: ra.stage, team_size: ra.team_size, needs: ra.needs, needs_note: ra.needs_note, source: ra.source, community: ra.community, want_demo: ra.want_demo } })
    raDone.value = r.open ? 'open' : r.already ? 'already' : 'sent'; if (r.open) await refreshNuxtData() }
  catch (e) { msg.value = err(e) } finally { raBusy.value = false }
}
</script>

<template>
  <div class="su">
    <aside class="side">
      <a class="mk" href="https://finvry.com"><BrandMark light /></a>
      <div class="pitch"><h2>The OS for every founder.</h2><p>Investor metrics, fundraising, requirements and engagement in one place. Set up in minutes.</p></div>
      <ol v-if="!gated" class="rail"><li v-for="(s, i) in STEPS" :key="s.t" :class="{ on: step === i + 1, done: step > i + 1 }"><span class="n">{{ step > i + 1 ? '✓' : i + 1 }}</span><span><b>{{ s.t }}</b><em>{{ s.d }}</em></span></li></ol>
      <ul class="trust"><li>14-day free trial on every plan</li><li>Bring figures from QuickBooks or Google Sheets</li><li>Your data stays yours; export any time</li></ul>
      <p class="legal"><a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a> · <a href="https://finvry.com">finvry.com</a></p>
    </aside>
    <main class="pane">
      <div v-if="brand.key !== 'finvry'" class="form"><h1>Create an account</h1><p class="hint">Sign-up is on Finvry. <a href="https://app.finvry.com/start">Go to app.finvry.com/start →</a></p></div>
      <div v-else-if="gated" class="form">
        <div v-if="raDone" class="done"><h1>{{ raDone === 'open' ? 'Sign-up is open' : 'Thank you' }}</h1>
          <p class="hint">{{ raDone === 'sent' ? 'We have your request and sent a confirmation to ' + ra.email + '. We open new accounts in small groups so every company gets set up properly; we will email you as soon as yours is ready.' : raDone === 'already' ? 'We already have a request from ' + ra.email + '. We will email you as soon as your account is ready.' : 'You can create your account now.' }}</p>
          <a class="go lnkbtn" href="https://finvry.com">Back to finvry.com</a></div>
        <form v-else @submit.prevent="requestAccess"><h1>Request access</h1>
          <p class="hint">{{ data?.invite === false ? 'That invitation has expired or was already used. Ask again below and we will send a new one.' : data?.mode === 'closed' ? 'We are not opening new accounts just now. Leave your details and we will email you when we do.' : 'Finvry opens to new companies in small groups. Tell us about yours and we will email you an invitation.' }}</p>
          <div class="two"><label class="fl">Full name<input v-model="ra.name" required maxlength="120" autocomplete="name"></label><label class="fl">Work email<input v-model="ra.email" type="email" required maxlength="254" autocomplete="email"></label></div>
          <div class="two"><label class="fl">Company<input v-model="ra.company" required maxlength="200" autocomplete="organization"></label><label class="fl">Website<input v-model="ra.website" maxlength="300" placeholder="yourcompany.com"></label></div>
          <div class="two"><label class="fl">Country<CountrySelect v-model="ra.country" required /></label>
            <label class="fl">Company stage<select v-model="ra.stage" required><option value="" disabled>Choose</option><option value="idea">Idea</option><option value="pre_seed">Pre-seed</option><option value="seed">Seed</option><option value="series_a">Series A or later</option><option value="established">Established business</option></select></label></div>
          <label class="fl">Team size<select v-model="ra.team_size" required><option value="" disabled>Choose</option><option v-for="t in ['1', '2-5', '6-20', '21-50', '51+']" :key="t" :value="t">{{ t === '1' ? 'Just me' : t + ' people' }}</option></select></label>
          <div class="fl">What do you need Finvry for?<div class="needs"><label v-for="[k, l] in NEEDS" :key="k" class="nd" :class="{ on: ra.needs.includes(k) }"><input v-model="ra.needs" type="checkbox" :value="k" class="sr">{{ l }}</label></div>
            <textarea v-model="ra.needs_note" rows="2" maxlength="1000" placeholder="Anything else we should know (optional)" /></div>
          <div class="two"><label class="fl">How did you hear about us? <small>optional</small><select v-model="ra.source"><option value="">Choose</option><option v-for="x in SOURCES" :key="x">{{ x }}</option></select></label>
            <label v-if="ra.source === 'A startup community' || ra.source === 'My VC, accelerator or incubator' || ra.source === 'An event'" class="fl">Which one?<input v-model="ra.community" maxlength="120"></label></div>
          <label class="ck"><input v-model="ra.want_demo" type="checkbox"> I would like a short walkthrough</label>
          <input v-model="ra.hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          <button class="go" type="submit" :disabled="raBusy">{{ raBusy ? 'Sending…' : 'Request access' }}</button>
          <div v-if="data?.mode === 'invite_only'" class="pcb"><button v-if="!codeOpen" type="button" class="lnk" @click="codeOpen = true">Have a partner or community code? Skip the queue</button>
            <template v-else><label class="fl">Partner or community code<span class="pcr"><input v-model="pc.code" maxlength="40" placeholder="e.g. ACME-7KQ2" @input="pc.ok = null; pc.err = ''"><button type="button" class="pcbtn" :disabled="pc.busy || pc.code.trim().length < 4" @click="checkCode().then(() => { if (pc.ok) pc.open = true })">{{ pc.busy ? 'Checking…' : 'Continue' }}</button></span></label><p v-if="pc.err" class="error">{{ pc.err }}</p></template></div></form>
        <HumanCheck v-if="!raDone" ref="hc" v-model="human" v-model:ready="humanReady" />
        <p v-if="msg" class="error" role="alert">{{ msg }}</p>
        <p class="foot">Already have an account? <NuxtLink to="/login">Sign in</NuxtLink></p>
      </div>
      <div v-else class="form">
        <div class="prog"><span>Step {{ step }} of 4</span><i><b :style="{ width: Math.max(6, pct) + '%' }" /></i></div>
        <form v-if="step === 1" :class="{ gate: !humanReady }" @submit.prevent="next"><h1>Create your account</h1><p class="hint">{{ inv ? 'Welcome, ' + inv.name.split(' ')[0] + '. Your details are filled in from your request.' : 'Every plan starts with a 14-day free trial.' }}</p>
          <label class="fl">Your full name<input v-model="f.name" required maxlength="120" autocomplete="name" placeholder="Ada Okafor" autofocus></label>
          <label class="fl">Work email<input v-model="f.email" type="email" required maxlength="254" autocomplete="email" placeholder="ada@yourcompany.com" :readonly="!!inv"></label>
          <button class="go" type="submit">Continue</button></form>
        <form v-else-if="step === 2" @submit.prevent="next"><h1>About your company</h1><p class="hint">We use this to set your currency and filing reminders.</p>
          <label class="fl">Company name<input v-model="f.company" required maxlength="200" autocomplete="organization" placeholder="Acme Technologies"></label>
          <div class="fl">Where is your company based?
            <div class="mk2"><button v-for="m in MARKETS" :key="m.name" type="button" class="mt" :class="{ on: market === m.name }" @click="market = m.name"><span class="fg">{{ m.flag }}</span><b>{{ m.name }}</b><em>{{ m.note }}</em></button>
              <button type="button" class="mt" :class="{ on: market === 'Other' }" @click="market = 'Other'"><span class="fg">🌍</span><b>Other</b><em>Billed in US dollars</em></button></div></div>
          <label v-if="market === 'Other'" class="fl">Country<CountrySelect v-model="f.country" required /></label>
          <div class="setup"><b>Set up for {{ f.country || 'your country' }}</b><ul><li v-for="x in setup" :key="x">{{ x }}</li></ul></div>
          <label class="fl">Company type <small>optional</small><select v-model="f.entity_type"><option value="">Choose</option><option v-for="(l, k) in TYPES" :key="k" :value="k">{{ l }}</option></select></label>
          <label v-if="f.entity_type === 'us_llc' || f.entity_type === 'us_corp'" class="fl">State of formation<select v-model="f.state"><option>Delaware</option><option>Wyoming</option><option>Other US state</option></select></label>
          <p class="note">{{ f.entity_type && f.entity_type !== 'other' ? 'We will add your usual filing deadlines to your compliance calendar, with reminders. ' : '' }}</p>
          <input v-model="f.website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          <button class="go" type="submit">Continue</button><button class="back" type="button" @click="step--">← Back</button></form>
        <form v-else-if="step === 3" @submit.prevent="create"><h1>Choose a plan</h1><p class="hint">Every plan starts with a 14-day free trial and is billed yearly after it. Change plan any time.</p><p v-if="cardNote" class="note card">{{ LOCAL_CARD_NOTE }}</p>
          <div class="plans"><label v-for="p in data?.plans ?? []" :key="p.code" class="pc" :class="{ on: f.plan === p.code, pop: p.code === 'company_startup' }"><input v-model="f.plan" type="radio" :value="p.code" class="sr">
            <span class="ph"><b>{{ p.name }}</b><i v-if="p.code === 'company_startup'">Most popular</i></span><span class="pp"><strong>{{ amount(p) }}</strong><em>/ month</em><small>{{ yearly(p) }}</small></span>
            <ul><li v-for="x in FEATS[p.code] ?? [p.description]" :key="x">{{ x }}</li></ul></label></div>
          <div class="pcb"><button v-if="!pc.open" type="button" class="lnk" @click="pc.open = true">Have a partner code from your VC, incubator or accelerator?</button>
            <template v-else><label class="fl">Partner code<span class="pcr"><input v-model="pc.code" maxlength="40" placeholder="e.g. ACME-7KQ2" @input="pc.ok = null; pc.err = ''"><button type="button" class="pcbtn" :disabled="pc.busy || pc.code.trim().length < 4" @click="checkCode">{{ pc.busy ? 'Checking…' : 'Apply' }}</button></span></label>
              <p v-if="pc.ok" class="pcok">✓ {{ pc.ok.pct }}% off your plan{{ pc.ok.months ? ' for ' + pc.ok.months + ' months' : '' }} from {{ pc.ok.partner }}.</p><p v-else-if="pc.err" class="error">{{ pc.err }}</p>
              <p class="hint sm">See partners at <a href="/partners" target="_blank">app.finvry.com/partners</a>. Ask your partner for the code.</p></template></div>
          <div class="agb"><b>Sign our agreements</b><p class="hint">Our Terms of Service and Data Privacy Agreement{{ isNigeria(f.country) ? ' under Nigerian law' : ' under California and US federal law' }}. A signed copy goes to your email and your Finvry Documents.</p>
            <ClientOnly><AgreementSign v-if="agDocs.length" v-model="agree" compact title="" md="" :docs="agDocs" /></ClientOnly><p v-if="!agDocs.length" class="hint">Loading the agreements…</p></div>
          <button class="go" type="submit" :disabled="busy || !agreed">{{ busy ? 'Creating your account…' : 'Create account' }}</button><button class="back" type="button" @click="step--">← Back</button></form>
        <form v-else @submit.prevent="verify"><h1>Check your email</h1><p class="hint">We sent a 6-digit code to <b>{{ f.email }}</b>. It expires in 10 minutes.</p>
          <div class="otp" @paste="onPaste"><input v-for="(d, i) in digits" :key="i" :ref="(el) => { if (el) boxes[i] = el as HTMLInputElement }" :value="d" inputmode="numeric" autocomplete="one-time-code" maxlength="6" :aria-label="'Digit ' + (i + 1)" @input="onDigit(i, $event)" @keydown="onKey(i, $event)"></div>
          <button class="go" type="submit" :disabled="busy || f.code.length !== 6">{{ busy ? 'Checking…' : 'Open Finvry' }}</button>
          <p class="hint sm">Didn't get it? Check spam, or <button type="button" class="lnk" :disabled="cool > 0" @click="resend">{{ cool > 0 ? 'resend in ' + cool + 's' : 'send a new code' }}</button>. <button type="button" class="lnk" @click="step = 1">Use a different email</button></p></form>
        <HumanCheck v-show="step < 4" ref="hc" v-model="human" v-model:ready="humanReady" />
        <p v-if="msg" class="error" role="alert">{{ msg }}</p>
        <p v-if="step < 4" class="foot">Already have an account? <NuxtLink to="/login">Sign in</NuxtLink></p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.su { min-height: var(--vh100, 100vh); display: grid; grid-template-columns: minmax(340px, 44%) 1fr; font-family: var(--font-body); background: #fff; }
.su * { box-sizing: border-box; border-radius: 0; }
.side { background: #0c1a2e; color: rgba(255,255,255,.72); padding: 44px 56px; display: flex; flex-direction: column; gap: 44px; position: relative; overflow: hidden; }
.mk { color: #fff; text-decoration: none; width: fit-content; }
.pitch h2 { font-family: var(--font-heading); color: #fff; font-size: clamp(30px, 3vw, 42px); line-height: 1.05; letter-spacing: -.035em; margin: 0 0 14px; font-weight: 600; } .pitch p { margin: 0; font-size: 16px; max-width: 380px; }
.rail { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; } .rail li { display: flex; gap: 14px; padding: 14px 0; border-top: 1px solid rgba(255,255,255,.1); } .rail li:last-child { border-bottom: 1px solid rgba(255,255,255,.1); }
.rail .n { width: 28px; height: 28px; flex: none; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.25); font-size: 13px; font-weight: 600; color: rgba(255,255,255,.6); }
.rail b { display: block; color: rgba(255,255,255,.75); font-weight: 600; font-size: 15px; } .rail em { display: block; font-style: normal; font-size: 13px; color: rgba(255,255,255,.45); }
.rail li.on .n { background: #5fa8d3; border-color: #5fa8d3; color: #0c1a2e; } .rail li.on b { color: #fff; } .rail li.done .n { background: rgba(255,255,255,.12); border-color: transparent; color: #fff; }
.trust { list-style: none; padding: 0; margin: auto 0 0; display: grid; gap: 10px; font-size: 14px; } .trust li { display: flex; gap: 10px; } .trust li:before { content: ''; width: 8px; height: 8px; background: #5fa8d3; margin-top: 7px; flex: none; }
.legal { margin: 0; font-size: 12.5px; color: rgba(255,255,255,.45); } .legal a { color: inherit; }
.pane { display: flex; align-items: center; justify-content: center; padding: 48px 32px; }
.form { width: 100%; max-width: 460px; }
.prog { display: flex; align-items: center; gap: 14px; margin-bottom: 34px; font-size: 13px; color: var(--c-muted); font-weight: 500; } .prog i { flex: 1; height: 3px; background: #e6e9ee; display: block; } .prog b { display: block; height: 100%; background: #0c1a2e; transition: width .3s; }
h1 { font-family: var(--font-heading); font-size: 32px; letter-spacing: -.03em; line-height: 1.1; margin: 0 0 8px; color: #0c1a2e; font-weight: 600; } .hint { color: var(--c-muted); margin: 0 0 26px; font-size: 15px; } .hint.sm { font-size: 13.5px; margin: 18px 0 0; }
form { display: flex; flex-direction: column; gap: 16px; } .fl { display: flex; flex-direction: column; gap: 7px; font-size: 13.5px; font-weight: 500; color: #3b4658; } .fl small { font-weight: 400; color: var(--c-muted); }
input, select, :deep(select) { font: inherit; font-size: 15.5px; padding: 12px 14px; border: 1px solid #cfd5dd; background: #fff; color: #0c1a2e; width: 100%; } input:focus, select:focus { outline: none; border-color: #0c1a2e; box-shadow: 0 0 0 3px rgba(95,168,211,.25); }
.note { margin: -4px 0 0; font-size: 13px; color: var(--c-muted); } .note.card { margin: -14px 0 4px; background: #f3f8fc; border-left: 3px solid #5fa8d3; padding: 9px 12px; color: #3b4658; }
.mk2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 8px; margin-top: 2px; } .mt { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 12px; border: 1px solid #dfe3e9; background: #fff; font: inherit; cursor: pointer; text-align: left; }
.mt:hover { border-color: #9aa5b4; } .mt.on { border-color: #0c1a2e; box-shadow: inset 0 0 0 1px #0c1a2e; background: #f7f9fb; } .mt .fg { font-size: 20px; line-height: 1; } .mt b { font-size: 14px; color: #0c1a2e; font-weight: 600; } .mt em { font-style: normal; font-size: 11.5px; color: var(--c-muted); font-weight: 400; }
.setup { background: #f7f9fb; border: 1px solid #e6e9ee; padding: 12px 14px; font-size: 13.5px; color: #3b4658; } .setup b { color: #0c1a2e; } .setup ul { margin: 6px 0 0; padding-left: 18px; display: grid; gap: 3px; }
.go { height: 50px; border: 0; background: #0c1a2e; color: #fff; font: inherit; font-weight: 600; font-size: 15.5px; cursor: pointer; margin-top: 6px; } .go:hover { background: #1c547d; } .go:disabled { opacity: .5; cursor: default; }
.back { background: none; border: 0; color: var(--c-muted); font: inherit; font-size: 14px; cursor: pointer; align-self: flex-start; padding: 0; } .back:hover { color: #0c1a2e; }
.plans { display: grid; gap: 10px; } .pc { position: relative; border: 1px solid #dfe3e9; padding: 16px 18px; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; transition: border-color .15s; }
.pc:hover { border-color: #9aa5b4; } .pc.on { border-color: #0c1a2e; box-shadow: inset 0 0 0 1px #0c1a2e; background: #f7f9fb; } .sr { position: absolute; opacity: 0; width: 1px; height: 1px; }
.ph { display: flex; align-items: center; gap: 10px; } .ph b { font-size: 17px; color: #0c1a2e; font-weight: 600; } .ph i { font-style: normal; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; background: #5fa8d3; color: #0c1a2e; padding: 2px 7px; }
.pp { text-align: right; } .pp strong { font-size: 22px; color: #0c1a2e; letter-spacing: -.02em; font-weight: 600; } .pp em { font-style: normal; font-size: 12.5px; color: var(--c-muted); margin-left: 4px; }
.pc ul { grid-column: 1 / -1; list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: #4b5668; } .pc li:before { content: '✓ '; color: #1c547d; }
.otp { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; } .otp input { text-align: center; font-size: 26px; font-weight: 600; padding: 14px 0; font-family: ui-monospace, Menlo, monospace; }
.lnk { background: none; border: 0; color: #1c547d; font: inherit; cursor: pointer; padding: 0; text-decoration: underline; text-underline-offset: 2px; } .lnk:disabled { color: var(--c-muted); text-decoration: none; cursor: default; }
.error { color: var(--c-danger); margin: 16px 0 0; font-size: 14px; } .foot { margin: 26px 0 0; font-size: 14px; color: var(--c-muted); } .hp { position: absolute; left: -9999px; width: 1px; height: 1px; }
@media (max-width: 900px) { .su { grid-template-columns: 1fr; } .side { padding: 28px 24px; gap: 22px; } .pitch, .trust, .legal, .rail em { display: none; } .rail { flex-direction: row; gap: 8px; } .rail li { border: 0 !important; padding: 0; } .rail b { display: none; } .pane { align-items: flex-start; padding: 32px 20px; } }
.gate { opacity: .45; pointer-events: none; transition: opacity .4s; }
.agb { display: flex; flex-direction: column; gap: 8px; margin: 18px 0 4px; padding-top: 16px; border-top: 1px solid #dfe3e9; } .agb > b { font-size: 15px; }
.pcb { margin: 14px 0 0; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .pp small { display: block; font-size: 11.5px; color: var(--c-muted); }
.needs { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 6px; } .nd { border: 1px solid #dfe3e9; padding: 7px 10px; font-size: 13px; font-weight: 400; cursor: pointer; color: #3b4658; } .nd.on { border-color: #0c1a2e; box-shadow: inset 0 0 0 1px #0c1a2e; background: #f7f9fb; color: #0c1a2e; }
textarea { font: inherit; font-size: 14.5px; padding: 10px 12px; border: 1px solid #cfd5dd; width: 100%; } .ck { display: flex; gap: 8px; align-items: center; font-size: 14px; color: #3b4658; } .ck input { width: auto; }
.done .lnkbtn { display: inline-grid; place-items: center; padding: 0 22px; text-decoration: none; } @media (max-width: 600px) { .two { grid-template-columns: 1fr; } } .pcr { display: flex; gap: 8px; } .pcr input { flex: 1; text-transform: uppercase; } .pcbtn { font: inherit; font-size: 14px; padding: 0 16px; background: #fff; border: 1px solid #c9ced6; cursor: pointer; } .pcok { color: #1d5a86; font-size: 13.5px; margin: 6px 0 0; }
</style>
