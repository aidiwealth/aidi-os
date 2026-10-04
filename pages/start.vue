<script setup lang="ts">
// Finvry sign-up: you, your company and country, a plan (naira for Nigeria, dollars elsewhere), then the emailed code.
definePageMeta({ layout: 'plain' })
useHead({ title: 'Create your Finvry account' })
const brand = useBrand()
interface Plan { code: string; name: string; description: string; seat_limit: number | null; usd: number | null; ngn: number | null }
const { data } = await useFetch<{ plans: Plan[] }>('/api/public/signup')
const COUNTRIES = ['Nigeria', 'United States', 'United Kingdom', 'Ghana', 'Kenya', 'South Africa', 'Canada', 'Other']
const step = ref(1)
const f = reactive({ website: '', name: '', email: '', company: '', country: 'Nigeria', entity_type: '', state: 'Delaware', plan: 'company_free', code: '' })
const TYPES: Record<string, string> = { us_llc: 'LLC (United States)', us_corp: 'C-Corp / Inc (United States)', ng_ltd: 'Limited company (Nigeria)', other: 'Other / not formed yet' }
const ngn = computed(() => f.country === 'Nigeria')
const price = (p: Plan) => { const v = ngn.value ? p.ngn : p.usd; return v === null ? 'Contact us' : v === 0 ? 'Free' : (ngn.value ? '₦' : '$') + v.toLocaleString('en-US') + ' / month' }
const msg = ref(''); const busy = ref(false)
function err(e: unknown) { return (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Please try again.' }
function next() { msg.value = ''; if (step.value === 1 && (!f.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))) { msg.value = 'Add your name and a valid email.'; return } if (step.value === 2 && !f.company.trim()) { msg.value = 'Add your company name.'; return } step.value++ }
async function create() { busy.value = true; msg.value = ''; try { const r = await $fetch<{ emailed: boolean }>('/api/public/signup', { method: 'POST', body: { website: f.website, name: f.name, email: f.email, company: f.company, country: f.country, entity_type: f.entity_type || undefined, state: f.state, plan: f.plan } }); if (!r.emailed) msg.value = 'Your account is ready, but we could not send the code. Go to Sign in and request one.'; step.value = 4 } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function verify() { busy.value = true; msg.value = ''; try { await $fetch('/api/auth/verify-otp', { method: 'POST', body: { email: f.email, code: f.code } }); await navigateTo('/') } catch (e) { msg.value = err(e) } finally { busy.value = false } }
</script>

<template>
  <div class="box">
    <div class="brand"><BrandMark /></div>
    <template v-if="brand.key !== 'finvry'"><h1>Create an account</h1><p class="hint">Sign-up is on Finvry. <a href="https://app.finvry.com/start">Go to app.finvry.com/start →</a></p></template>
    <template v-else>
      <ol class="steps"><li v-for="(s, i) in ['You', 'Company', 'Plan', 'Verify']" :key="s" :class="{ on: step === i + 1, done: step > i + 1 }">{{ s }}</li></ol>
      <form v-if="step === 1" @submit.prevent="next"><h1>Financial and investor management for your company</h1><p class="hint">Start free. No card needed.</p>
        <label class="label">Your name<input v-model="f.name" required maxlength="120" autocomplete="name"></label>
        <label class="label">Work email<input v-model="f.email" type="email" required maxlength="254" autocomplete="email"></label>
        <button class="btn" type="submit">Continue</button></form>
      <form v-else-if="step === 2" @submit.prevent="next"><h1>Your company</h1>
        <label class="label">Company name<input v-model="f.company" required maxlength="200" autocomplete="organization"></label>
        <label class="label">Country<select v-model="f.country"><option v-for="c in COUNTRIES" :key="c">{{ c }}</option></select></label>
        <label class="label">Company type<select v-model="f.entity_type"><option value="">Choose (optional)</option><option v-for="(l, k) in TYPES" :key="k" :value="k">{{ l }}</option></select></label>
        <label v-if="f.entity_type === 'us_llc' || f.entity_type === 'us_corp'" class="label">State of formation<select v-model="f.state"><option>Delaware</option><option>Wyoming</option><option>Other US state</option></select></label>
        <p v-if="f.entity_type && f.entity_type !== 'other'" class="hint sm">We'll add your usual filing deadlines to your compliance calendar, with reminders.</p>
        <p class="hint sm">{{ ngn ? 'You will be billed in naira.' : 'You will be billed in US dollars.' }}</p>
        <input v-model="f.website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="row"><button class="btn secondary" type="button" @click="step--">Back</button><button class="btn" type="submit">Continue</button></div></form>
      <form v-else-if="step === 3" @submit.prevent="create"><h1>Choose a plan</h1><p class="hint">Paid plans start with a 14-day free trial. You can change plan any time.</p>
        <label v-for="p in data?.plans ?? []" :key="p.code" class="plan" :class="{ on: f.plan === p.code }"><input v-model="f.plan" type="radio" :value="p.code"><span><b>{{ p.name }}</b><em>{{ p.description }}</em></span><strong>{{ price(p) }}</strong></label>
        <div class="row"><button class="btn secondary" type="button" @click="step--">Back</button><button class="btn" type="submit" :disabled="busy">{{ busy ? 'Creating…' : 'Create account' }}</button></div></form>
      <form v-else @submit.prevent="verify"><h1>Check your email</h1><p class="hint">We sent a 6-digit code to {{ f.email }}. It expires in 10 minutes.</p>
        <label class="label">Code<input v-model="f.code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required class="code"></label>
        <button class="btn" type="submit" :disabled="busy || f.code.length !== 6">{{ busy ? 'Checking…' : 'Open Finvry' }}</button></form>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
      <p v-if="step < 4" class="foot">Already have an account? <NuxtLink to="/login">Sign in</NuxtLink></p>
    </template>
  </div>
</template>

<style scoped>
.box { width: 100%; max-width: 520px; background: #fff; padding: 36px; border: 1px solid var(--c-rule); box-shadow: var(--shadow-pop); }
.brand { margin-bottom: 22px; color: var(--c-navy); } h1 { margin: 0 0 8px; font-size: 26px; } .hint { color: var(--c-muted); margin: 0 0 18px; } .sm { font-size: 13px; margin: -6px 0 12px; }
.steps { display: flex; gap: 16px; list-style: none; padding: 0; margin: 0 0 22px; font-size: 13px; color: var(--c-muted); } .steps .on { color: var(--c-navy); font-weight: 500; } .steps .done { color: var(--c-blue-deep); }
form { display: flex; flex-direction: column; gap: 14px; } label.label { display: flex; flex-direction: column; gap: 6px; }
input, select { font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid var(--c-rule-strong); background: #fff; } .code { font-size: 24px; letter-spacing: .4em; font-family: ui-monospace, Menlo, monospace; }
.plan { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--c-rule); padding: 14px; cursor: pointer; } .plan.on { border-color: var(--c-navy); box-shadow: inset 0 0 0 1px var(--c-navy); } .plan input { width: auto; margin-top: 3px; }
.plan span { flex: 1; display: flex; flex-direction: column; gap: 3px; } .plan b { font-family: var(--font-heading); font-weight: 500; font-size: 20px; color: var(--c-navy); } .plan em { font-style: normal; font-size: 13px; color: var(--c-ink-soft); } .plan strong { white-space: nowrap; font-weight: 600; }
.row { display: flex; gap: 10px; justify-content: space-between; } .error { color: var(--c-danger); margin: 14px 0 0; } .foot { margin: 18px 0 0; font-size: 13.5px; color: var(--c-muted); } .hp { position: absolute; left: -9999px; width: 1px; height: 1px; }
</style>
