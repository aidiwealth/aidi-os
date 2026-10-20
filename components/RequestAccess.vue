<script setup lang="ts">
// Request access to Finvry as a short conversation: one question at a time, answers kept as replies you can tap to
// change, over the landing page's film. Sends the same request as before (name, email, company, country, stage, team,
// needs, how they heard, demo) and keeps the bot check. A partner or community code skips the queue.
const props = defineProps<{ mode: 'invite_only' | 'closed'; inviteFailed?: boolean }>()
const emit = defineEmits<{ partner: [v: { code: string; ok: { partner: string; pct: number; months: number | null } }] }>()
const COUNTRIES = ['United States', 'Nigeria', 'United Kingdom', 'Kenya', 'Ghana', 'Canada']
const STAGES: [string, string][] = [['idea', 'Idea'], ['pre_seed', 'Pre-seed'], ['seed', 'Seed'], ['series_a', 'Series A or later'], ['established', 'Established business']]
const TEAMS: [string, string][] = [['1', 'Just me'], ['2-5', '2–5'], ['6-20', '6–20'], ['21-50', '21–50'], ['51+', '51+']]
const NEEDS: [string, string][] = [['reporting', 'Financial reporting'], ['investors', 'Investor updates'], ['fundraising', 'Fundraising and data room'], ['cap_table', 'Cap table and SAFEs'], ['forecast', 'Forecasts'], ['customers', 'Customer analysis'], ['group', 'A group with subsidiaries'], ['compliance', 'Compliance'], ['services', 'Company services']]
const SOURCES = ['A startup community', 'My VC or accelerator', 'Search', 'LinkedIn or X', 'A friend', 'An event', 'Other']
const a = reactive({ name: '', email: '', company: '', website: '', country: '', other: false, stage: '', team_size: '', needs: [] as string[], needs_note: '', source: '', community: '', want_demo: null as boolean | null, hp: '' })
const step = ref(0), busy = ref(false), msg = ref(''), done = ref<'' | 'sent' | 'already'>('')
const first = computed(() => a.name.trim().split(/\s+/)[0] || '')
const hc = ref<{ fresh: () => Promise<string> } | null>(null), human = ref(''), humanReady = ref(false)
const thread = ref<HTMLElement | null>(null), input = ref<HTMLInputElement | null>(null)
// The questions, in order. q is what Finvry asks; ans is the reply shown once answered.
const Q = computed(() => [
  { q: props.inviteFailed ? 'That invitation has expired or was already used. Let\'s get you a new one. What\'s your name?' : props.mode === 'closed' ? 'We\'re not opening new accounts just now, but I\'ll keep your place. What\'s your name?' : 'Hi, I\'m Finvry. I\'ll set up your request in a minute. What\'s your name?', ans: a.name },
  { q: 'Nice to meet you, ' + first.value + '. What\'s your work email?', ans: a.email },
  { q: 'Which company are you building?', ans: a.company + (a.website ? ' · ' + a.website.replace(/^https?:\/\//, '') : '') },
  { q: 'Where is ' + (a.company || 'it') + ' based?', ans: a.country },
  { q: 'What stage are you at?', ans: STAGES.find(([k]) => k === a.stage)?.[1] ?? '' },
  { q: 'How big is the team?', ans: TEAMS.find(([k]) => k === a.team_size)?.[1] ?? '' },
  { q: 'What would you like Finvry to help with? Pick any.', ans: a.needs.map((n) => NEEDS.find(([k]) => k === n)?.[1]).join(', ') + (a.needs_note ? ' · ' + a.needs_note : '') },
  { q: 'How did you hear about us?', ans: a.source ? a.source + (a.community ? ' · ' + a.community : '') : 'Skipped' },
  { q: 'Last one: would a short walkthrough help?', ans: a.want_demo === null ? '' : a.want_demo ? 'Yes, please' : 'No thanks' }])
async function focus() { await nextTick(); input.value?.focus(); thread.value?.scrollTo({ top: thread.value.scrollHeight, behavior: 'smooth' }) }
function go(n: number) { msg.value = ''; step.value = n; void focus() }
function next() {
  msg.value = ''
  const s = step.value
  if (s === 0 && a.name.trim().length < 2) { msg.value = 'Your full name, please.'; return }
  if (s === 1 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) { msg.value = 'That email does not look right.'; return }
  if (s === 2 && !a.company.trim()) { msg.value = 'Your company name, please.'; return }
  if (s === 3 && !a.country) { msg.value = 'Choose a country.'; return }
  if (s === 6 && !a.needs.length) { msg.value = 'Pick at least one.'; return }
  go(s + 1)
}
const pick = (k: 'stage' | 'team_size' | 'country' | 'source', v: string) => { a[k] = v; if (k === 'country') a.other = false; if (k !== 'source' || !/community|VC|event/i.test(v)) next() }
async function send(demo: boolean) {
  a.want_demo = demo; busy.value = true; msg.value = ''
  try {
    const tt = await hc.value?.fresh()
    const r = await $fetch<{ already?: boolean; open?: boolean }>('/api/public/access-request', { method: 'POST', body: { turnstile_token: tt || undefined, website_hp: a.hp, name: a.name.trim(), email: a.email.trim(), company: a.company.trim(), website: a.website.trim(), country: a.country, stage: a.stage, team_size: a.team_size, needs: a.needs, needs_note: a.needs_note.trim(), source: a.source, community: a.community.trim(), want_demo: demo } })
    if (r.open) { window.location.reload(); return }
    done.value = r.already ? 'already' : 'sent'; step.value = Q.value.length; void focus()
  } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Please try again.' } finally { busy.value = false }
}
// Partner or community code: checked here; a good one unlocks the sign-up straight away.
const code = reactive({ open: false, v: '', busy: false, err: '' })
async function tryCode() {
  code.busy = true; code.err = ''
  try { const ok = await $fetch<{ partner: string; pct: number; months: number | null }>('/api/public/partners/check', { method: 'POST', body: { code: code.v } }); emit('partner', { code: code.v, ok }) }
  catch (e) { code.err = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'That code did not work.' } finally { code.busy = false }
}
onMounted(() => { void focus() })
</script>

<template>
  <div class="ra">
    <video class="bg" autoplay muted loop playsinline preload="metadata" aria-hidden="true"><source src="https://pub-4af29fd81be44e49861e29c7da302f4a.r2.dev/hero2.mp4" type="video/mp4"></video>
    <div class="shade" aria-hidden="true" />
    <header class="top"><a href="https://finvry.com" class="mk"><BrandMark light /></a><NuxtLink to="/login" class="si">Sign in</NuxtLink></header>
    <div class="wrap">
      <div class="intro"><p class="ey">Request access</p><h1>The OS for every founder.</h1><p>We open Finvry to new companies in small groups so each one is set up properly. Answer a few questions and we'll email your invitation.</p></div>
      <section class="chat" aria-live="polite">
        <div ref="thread" class="thread">
          <template v-for="(x, i) in Q" :key="i">
            <div v-if="i <= step" class="bot"><img class="av" src="/brand/finvry-mark.svg" alt="" aria-hidden="true"><p>{{ x.q }}</p></div>
            <button v-if="i < step && x.ans" type="button" class="me" :title="done ? '' : 'Change'" :disabled="!!done" @click="go(i)">{{ x.ans }}</button>
          </template>
          <div v-if="done" class="bot fin"><img class="av" src="/brand/finvry-mark.svg" alt="" aria-hidden="true">
            <p>{{ done === 'sent' ? 'Thanks, ' + first + '. You\'re on the list. I\'ve sent a confirmation to ' + a.email + ', and your invitation will follow as soon as your place opens.' : 'We already have a request from ' + a.email + '. Your invitation will follow as soon as your place opens.' }}</p></div>
        </div>
        <form v-if="!done" class="reply" @submit.prevent="next">
          <template v-if="step === 0"><input ref="input" v-model="a.name" autocomplete="name" placeholder="Your full name" maxlength="120"><button class="go" aria-label="Send">→</button></template>
          <template v-else-if="step === 1"><input ref="input" v-model="a.email" type="email" autocomplete="email" placeholder="you@yourcompany.com" maxlength="254"><button class="go" aria-label="Send">→</button></template>
          <template v-else-if="step === 2"><div class="two"><input ref="input" v-model="a.company" autocomplete="organization" placeholder="Company name" maxlength="200"><input v-model="a.website" placeholder="Website (optional)" maxlength="300"></div><button class="go" aria-label="Send">→</button></template>
          <div v-else-if="step === 3" class="chips"><button v-for="c in COUNTRIES" :key="c" type="button" :class="{ on: a.country === c }" @click="pick('country', c)">{{ c }}</button><button type="button" :class="{ on: a.other }" @click="a.other = true; a.country = ''">Somewhere else</button>
            <span v-if="a.other" class="oc"><CountrySelect v-model="a.country" /><button class="go" type="submit" aria-label="Send">→</button></span></div>
          <div v-else-if="step === 4" class="chips"><button v-for="[k, l] in STAGES" :key="k" type="button" :class="{ on: a.stage === k }" @click="pick('stage', k)">{{ l }}</button></div>
          <div v-else-if="step === 5" class="chips"><button v-for="[k, l] in TEAMS" :key="k" type="button" :class="{ on: a.team_size === k }" @click="pick('team_size', k)">{{ l }}</button></div>
          <div v-else-if="step === 6" class="multi"><div class="chips"><label v-for="[k, l] in NEEDS" :key="k" :class="{ on: a.needs.includes(k) }"><input v-model="a.needs" type="checkbox" :value="k">{{ l }}</label></div>
            <div class="row"><input v-model="a.needs_note" placeholder="Anything else? (optional)" maxlength="1000"><button class="go" aria-label="Send">→</button></div></div>
          <div v-else-if="step === 7" class="multi"><div class="chips"><button v-for="x in SOURCES" :key="x" type="button" :class="{ on: a.source === x }" @click="pick('source', x)">{{ x }}</button><button type="button" class="skip" @click="a.source = ''; a.community = ''; next()">Skip</button></div>
            <div v-if="/community|VC|event/i.test(a.source)" class="row"><input ref="input" v-model="a.community" :placeholder="a.source === 'An event' ? 'Which event?' : 'Which one?'" maxlength="120"><button class="go" aria-label="Send">→</button></div></div>
          <div v-else-if="step === 8" class="chips"><button type="button" :disabled="busy" @click="send(true)">Yes, please</button><button type="button" :disabled="busy" @click="send(false)">No thanks</button><span v-if="busy" class="sending">Sending…</span></div>
          <input v-model="a.hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        </form>
        <p v-if="msg" class="err" role="alert">{{ msg }}</p>
        <div class="foot"><span class="dots" aria-hidden="true"><i v-for="(x, i) in Q" :key="i" :class="{ on: i <= step }" /></span>
          <template v-if="mode === 'invite_only' && !done"><button v-if="!code.open" type="button" class="lnk" @click="code.open = true">Have a partner code? Skip the queue</button>
            <form v-else class="code" @submit.prevent="tryCode"><input v-model="code.v" maxlength="40" placeholder="Partner or community code"><button :disabled="code.busy || code.v.trim().length < 4">{{ code.busy ? '…' : 'Use code' }}</button></form></template></div>
        <p v-if="code.err" class="err">{{ code.err }}</p>
        <HumanCheck ref="hc" v-model="human" v-model:ready="humanReady" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.ra { position: relative; min-height: var(--vh100, 100vh); color: #fff; font-family: var(--font-body); overflow: hidden; background: #0c1a2e; }
.ra * { box-sizing: border-box; border-radius: 0; }
.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.shade { position: absolute; inset: 0; background: linear-gradient(100deg, rgba(8,18,32,.92) 0%, rgba(8,18,32,.78) 45%, rgba(8,18,32,.55) 100%); }
.top { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; padding: 28px 48px; } .mk { color: #fff; text-decoration: none; } .si { color: rgba(255,255,255,.8); text-decoration: none; font-size: 15px; } .si:hover { color: #fff; }
.wrap { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 560px); gap: 64px; align-items: center; max-width: 1240px; margin: 0 auto; padding: 24px 48px 64px; min-height: calc(var(--vh100, 100vh) - 100px); }
.ey { margin: 0 0 16px; font-size: 13px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #8cc3e6; }
.intro h1 { font-family: var(--font-heading); color: #fff; font-size: clamp(36px, 4.4vw, 60px); line-height: 1.02; letter-spacing: -.035em; margin: 0 0 18px; font-weight: 600; }
.intro p { margin: 0; font-size: 17px; line-height: 1.6; color: rgba(255,255,255,.75); max-width: 460px; }
.chat { background: rgba(255,255,255,.97); color: #0c1a2e; box-shadow: 0 30px 80px -30px rgba(0,0,0,.6); display: flex; flex-direction: column; max-height: min(720px, calc(var(--vh100, 100vh) - 140px)); }
.thread { flex: 1; overflow-y: auto; padding: 26px 26px 8px; display: flex; flex-direction: column; gap: 12px; }
.bot { display: flex; gap: 10px; align-items: flex-start; max-width: 92%; animation: in .35s ease both; }
.bot p { margin: 0; background: #f1f4f8; padding: 11px 14px; font-size: 15px; line-height: 1.5; color: #1c2a3d; }
.av { width: 28px; height: 28px; flex: none; object-fit: contain; margin-top: 4px; }
.me { align-self: flex-end; max-width: 85%; background: #0c1a2e; color: #fff; border: 0; padding: 10px 14px; font: inherit; font-size: 15px; text-align: left; cursor: pointer; animation: in .25s ease both; } .me:hover:not(:disabled) { background: #1c547d; } .me:disabled { cursor: default; }
@keyframes in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .bot, .me { animation: none; } }
.reply { padding: 14px 26px 6px; display: flex; gap: 8px; align-items: stretch; border-top: 1px solid #e6e9ee; }
.reply > input, .two input, .row input, .code input { flex: 1; min-width: 0; font: inherit; font-size: 15.5px; padding: 12px 14px; border: 1px solid #cfd5dd; background: #fff; color: #0c1a2e; } .reply input:focus { outline: none; border-color: #0c1a2e; box-shadow: 0 0 0 3px rgba(95,168,211,.25); }
.two { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.go { width: 48px; flex: none; border: 0; background: #0c1a2e; color: #fff; font-size: 20px; cursor: pointer; } .go:hover { background: #1c547d; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; align-items: center; }
.chips button, .chips label { border: 1px solid #cfd5dd; background: #fff; color: #0c1a2e; padding: 9px 13px; font: inherit; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; } .chips label input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.chips button:hover, .chips label:hover { border-color: #0c1a2e; } .chips .on { background: #0c1a2e; color: #fff; border-color: #0c1a2e; } .chips .skip { color: #6b7686; border-color: transparent; }
.oc { display: flex; gap: 8px; flex-basis: 100%; } .oc :deep(select) { flex: 1; font: inherit; font-size: 15px; padding: 11px 12px; border: 1px solid #cfd5dd; }
.multi { flex: 1; display: flex; flex-direction: column; gap: 10px; } .row { display: flex; gap: 8px; }
.sending { font-size: 13.5px; color: #6b7686; }
.err { margin: 6px 26px 0; color: #b42318; font-size: 13.5px; }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 26px 18px; flex-wrap: wrap; }
.dots { display: flex; gap: 5px; } .dots i { width: 14px; height: 3px; background: #dfe3e9; } .dots i.on { background: #0c1a2e; }
.lnk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: #1c547d; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.code { display: flex; gap: 6px; } .code input { padding: 8px 10px; font-size: 14px; text-transform: uppercase; } .code button { font: inherit; font-size: 13.5px; padding: 0 12px; border: 0; background: #0c1a2e; color: #fff; cursor: pointer; } .code button:disabled { opacity: .5; }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; }
@media (max-width: 900px) { .top { padding: 20px; } .wrap { grid-template-columns: 1fr; gap: 24px; padding: 8px 16px 32px; align-items: start; } .intro h1 { font-size: 34px; } .intro p { font-size: 15px; } .chat { max-height: none; } .two { grid-template-columns: 1fr; } }
</style>
