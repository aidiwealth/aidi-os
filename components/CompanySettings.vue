<script setup lang="ts">
// Company settings with a side menu: Company, Notifications, Plan & billing, Team.
interface P { code: string; name: string; description: string; seat_limit: number | null; usd: number | null; ngn: number | null }
interface D { name: string; website: string; country: string; currency: string; entity_type: string; state: string; notify_emails: string[]; plan: string; status: string; trial_ends_at: string | null; trial_used: boolean; plans: P[]; members: number; types: Record<string, string>; states: string[] }
const { data, refresh } = await useFetch<D>('/api/company/profile', { key: 'company-profile' })
useHead({ title: 'Settings' })
const route = useRoute(); const router = useRouter()
const SECTIONS = [['company', 'Company', 'Name, legal form, country and currency'], ['notifications', 'Notifications', 'Who gets emails from Finvry'], ['plan', 'Plan & billing', 'Your plan, trial and prices'], ['team', 'Team', 'People in your workspace']] as const
const sec = computed(() => (SECTIONS.find(([k]) => k === route.query.s)?.[0] ?? 'company'))
const go = (k: string) => router.replace({ query: { s: k } })
const COUNTRIES = ['Nigeria', 'United States', 'United Kingdom', 'Ghana', 'Kenya', 'South Africa', 'Rwanda', 'Egypt', 'Canada', 'Other']
const f = reactive({ name: '', website: '', country: '', currency: 'USD', entity_type: '', state: 'Delaware', seed: true })
const emails = ref<string[]>([]); const newEmail = ref('')
watchEffect(() => { const d = data.value; if (d) { Object.assign(f, { name: d.name, website: d.website, country: d.country, currency: d.currency, entity_type: d.entity_type, state: d.state || 'Delaware' }); emails.value = [...d.notify_emails] } })
const msg = ref(''); const ok = ref(''); const busy = ref(false)
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function saveProfile() { busy.value = true; msg.value = ''; ok.value = ''; try { const r = await $fetch<{ added: number }>('/api/company/profile', { method: 'POST', body: { section: 'profile', ...f } }); ok.value = 'Saved.' + (r.added ? ' ' + r.added + ' filing reminder' + (r.added === 1 ? '' : 's') + ' added to Compliance.' : ''); await refresh(); await refreshNuxtData('me') } catch (e) { msg.value = err(e) } finally { busy.value = false } }
function addEmail() { const e = newEmail.value.trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !emails.value.includes(e)) emails.value.push(e); newEmail.value = '' }
async function saveEmails() { busy.value = true; msg.value = ''; ok.value = ''; try { await $fetch('/api/company/profile', { method: 'POST', body: { section: 'notifications', notify_emails: emails.value } }); ok.value = 'Saved.'; await refresh() } catch (e) { msg.value = err(e) } finally { busy.value = false } }
async function choose(code: string) { busy.value = true; msg.value = ''; ok.value = ''; try { await $fetch('/api/company/plan', { method: 'POST', body: { plan: code } }); ok.value = 'Plan updated.'; await refresh(); await refreshNuxtData('me') } catch (e) { msg.value = err(e) } finally { busy.value = false } }
const ngn = computed(() => data.value?.currency === 'NGN')
const currentPlan = computed(() => { const d = data.value; return d ? (d.plans.find((p) => p.code === d.plan)?.name ?? d.plan) : '' })
const price = (p: P) => { const v = ngn.value ? p.ngn : p.usd; return v == null ? 'Contact us' : v === 0 ? 'Free' : (ngn.value ? '₦' : '$') + v.toLocaleString('en-US') }
const FEAT: Record<string, string[]> = { company_free: ['Dashboard and Financials', 'Public investor page', 'Compliance calendar', 'Order services', '1 team member'], company_startup: ['Everything in Free', 'AI investor updates with open tracking', 'Up to 5 team members', 'More AI and storage'], company_scale: ['Everything in Startup', 'Up to 20 team members', 'Most AI and storage', 'Priority service'] }
</script>
<template>
  <section v-if="data" class="cs">
    <h1>Settings</h1>
    <div class="lay">
      <nav class="side"><button v-for="[k, l, d] in SECTIONS" :key="k" type="button" :class="{ on: sec === k }" @click="go(k)"><b>{{ l }}</b><span>{{ d }}</span></button></nav>
      <div class="main">
        <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
        <form v-if="sec === 'company'" class="card frm" @submit.prevent="saveProfile">
          <h2>Company</h2>
          <label class="label wide">Company name<input v-model="f.name" required maxlength="200"></label>
          <label class="label wide">Website<input v-model="f.website" maxlength="300" placeholder="https://"></label>
          <label class="label">Country<select v-model="f.country"><option value="" disabled>Choose</option><option v-for="c in COUNTRIES" :key="c">{{ c }}</option></select></label>
          <label class="label">Reporting currency<select v-model="f.currency"><option value="USD">US dollar (USD)</option><option value="NGN">Nigerian naira (NGN)</option></select></label>
          <label class="label">Legal form<select v-model="f.entity_type"><option value="">Not set</option><option v-for="(l, k) in data.types" :key="k" :value="k">{{ l }}</option></select></label>
          <label v-if="f.entity_type === 'us_llc' || f.entity_type === 'us_corp'" class="label">State of formation<select v-model="f.state"><option v-for="s in data.states" :key="s">{{ s }}</option></select></label>
          <label v-if="f.entity_type && f.entity_type !== 'other'" class="chk wide"><input v-model="f.seed" type="checkbox"> Add the standard filing reminders for this legal form to Compliance</label>
          <div class="wide"><button class="btn" type="submit" :disabled="busy">Save changes</button></div>
        </form>
        <div v-else-if="sec === 'notifications'" class="card frm">
          <h2>Notifications</h2>
          <p class="muted wide">Filing reminders, investor page views and service updates go to these addresses. Leave empty to email your admins.</p>
          <div class="wide chips"><span v-for="(e, i) in emails" :key="e" class="chip">{{ e }}<button type="button" aria-label="Remove" @click="emails.splice(i, 1)">×</button></span><span v-if="!emails.length" class="muted">Your admins</span></div>
          <div class="wide add"><input v-model="newEmail" type="email" placeholder="name@company.com" @keydown.enter.prevent="addEmail"><button type="button" class="btn secondary" @click="addEmail">Add</button></div>
          <div class="wide"><button class="btn" type="button" :disabled="busy" @click="saveEmails">Save</button></div>
        </div>
        <div v-else-if="sec === 'plan'">
          <div class="card cur"><div><span class="muted">Current plan</span><h2>{{ currentPlan }}</h2><span v-if="data.status === 'trial'" class="trial">Free trial{{ data.trial_ends_at ? ' until ' + new Date(data.trial_ends_at + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : '' }}</span></div><span class="muted">Prices in {{ ngn ? 'naira' : 'US dollars' }} · {{ data.members }} member{{ data.members === 1 ? '' : 's' }}</span></div>
          <div class="plans"><div v-for="p in data.plans" :key="p.code" class="card pl" :class="{ on: p.code === data.plan }"><b>{{ p.name }}</b><span class="pr">{{ price(p) }}<em v-if="(ngn ? p.ngn : p.usd)"> / month</em></span>
            <ul><li v-for="x in FEAT[p.code] ?? []" :key="x">{{ x }}</li></ul>
            <button v-if="p.code !== data.plan" type="button" class="btn" :class="{ secondary: p.code === 'company_free' }" :disabled="busy" @click="choose(p.code)">{{ p.code === 'company_free' ? 'Move to Free' : !data.trial_used ? 'Start 14-day free trial' : 'Switch to ' + p.name }}</button><span v-else class="curb">Your plan</span></div></div>
          <p class="muted">Card billing (Stripe, or Paystack in naira) at the end of a trial is being switched on; until then we will email you before anything is charged.</p>
        </div>
        <div v-else class="card frm"><h2>Team</h2><p class="muted wide">Invite co-founders, your accountant or advisers. You have {{ data.members }} member{{ data.members === 1 ? '' : 's' }}.</p><div class="wide"><NuxtLink to="/team" class="btn">Manage team</NuxtLink></div></div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.cs h1 { margin: 0 0 16px; } .lay { display: grid; grid-template-columns: 250px 1fr; gap: 20px; align-items: start; }
.side { display: flex; flex-direction: column; background: #fff; border: 1px solid var(--c-rule); } .side button { text-align: left; background: none; border: 0; border-left: 3px solid transparent; padding: 12px 16px; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid var(--c-rule); }
.side button:last-child { border-bottom: 0; } .side b { font-weight: 600; font-size: 14px; color: var(--c-ink); } .side span { font-size: 12px; color: var(--c-muted); } .side button.on { border-left-color: var(--c-navy); background: var(--c-paper-2); } .side button.on b { color: var(--c-navy); }
.main { min-width: 0; max-width: 820px; } .frm { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .frm h2 { grid-column: 1 / -1; margin: 0; } .wide { grid-column: 1 / -1; } label.label { display: flex; flex-direction: column; gap: 6px; }
input, select { font: inherit; font-size: 14px; padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); } .chk { display: flex; gap: 8px; align-items: center; font-size: 14px; } .chk input { width: auto; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chip { display: inline-flex; align-items: center; gap: 6px; background: var(--c-signal-soft); color: var(--c-blue-deep); padding: 5px 4px 5px 10px; font-size: 13px; } .chip button { background: none; border: 0; font-size: 16px; cursor: pointer; color: var(--c-blue-deep); padding: 0 4px; }
.add { display: flex; gap: 8px; } .add input { flex: 1; } .cur { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; } .cur h2 { margin: 2px 0; } .trial { font-size: 13px; color: var(--c-blue-deep); }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px; } .pl { display: flex; flex-direction: column; gap: 8px; } .pl.on { border-color: var(--c-navy); box-shadow: inset 0 0 0 1px var(--c-navy); } .pl b { font-family: var(--font-heading); font-weight: 500; font-size: 24px; color: var(--c-navy); }
.pr { font-size: 22px; font-weight: 600; } .pr em { font-style: normal; font-size: 13px; color: var(--c-muted); font-weight: 400; } .pl ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--c-ink-soft); flex: 1; } .pl li { margin-bottom: 4px; } .curb { font-size: 13px; color: var(--c-ok); font-weight: 500; }
.muted { color: var(--c-muted); font-size: 13px; margin: 0; } .ok { color: var(--c-ok); } .error { color: var(--c-danger); } .btn { text-decoration: none; }
@media (max-width: 900px) { .lay { grid-template-columns: 1fr; } .plans, .frm { grid-template-columns: 1fr; } }
</style>
