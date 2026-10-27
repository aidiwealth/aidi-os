<script setup lang="ts">
// Aidi Wealth onboarding: a conversation with the assistant that builds the financial plan, sets the risk level and
// sets up the account. Answer in your own words or with the quick answers under each question. Invited clients end
// on their dashboard; website requests wait for an adviser.
definePageMeta({ layout: false })
useHead({ title: 'Set up your account · Aidi Wealth' })
interface Field { key: string; label: string; type: string; options?: [string, string][]; placeholder?: string; value?: string | number }
interface Widget { kind: string; fields?: Field[]; columns?: Field[]; quick?: { label: string; row: Record<string, unknown> }[]; rows?: Record<string, unknown>[]; options?: { value: string; label: string; note?: string }[]; suggested?: string; items?: { key: string; label: string; required: boolean }[]; submit?: string; skip?: string; upload?: string }
interface View { status: string; source: string; country: string; first: string; phases: string[]; phase: number; step: string | null; can_back: boolean; widget: Widget | null; messages: { role: 'ai' | 'me'; text: string }[]; plan: Record<string, any>; account_status: string | null }
const { data, error } = await useFetch<View>('/api/w/onboard', { key: 'onboard' })
if (data.value?.status === 'none') await navigateTo('/w', { replace: true })
const busy = ref(false), err = ref(''), text = ref('')
const form = reactive<Record<string, any>>({}), rows = ref<Record<string, any>[]>([]), pick = ref(''), agree = reactive<Record<string, boolean>>({})
const box = ref<HTMLElement | null>(null)
function reset() {
  const w = data.value?.widget
  for (const k of Object.keys(form)) delete form[k]
  for (const k of Object.keys(agree)) delete agree[k]
  for (const f of w?.fields ?? []) form[f.key] = f.value ?? ''
  rows.value = (w?.rows ?? []).map((r) => ({ ...r }))
  pick.value = w?.suggested ?? ''
  nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight })
}
watch(() => data.value?.step + ':' + data.value?.messages.length, reset, { immediate: true })
onMounted(reset)
async function send(body: Record<string, unknown>) {
  if (busy.value || !data.value?.step) return
  busy.value = true; err.value = ''
  try { data.value = await $fetch<View>('/api/w/onboard', { method: 'POST', body: { step: data.value.step, ...body } }); text.value = '' } catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Please try again.' } finally { busy.value = false; nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight }) }
}
const sendText = () => { const t = text.value.trim(); if (t) void send({ text: t }) }
const submitRows = () => send({ value: { rows: rows.value.filter((r) => Object.values(r).some((v) => v !== '' && v != null)) } })
function addRow(r: Record<string, unknown>) { rows.value.push({ ...r }) }
const file = ref<HTMLInputElement | null>(null)
async function upload(ev: Event) {
  const fs = Array.from((ev.target as HTMLInputElement).files ?? []); if (!fs.length) return
  const fd = new FormData(); fd.append('kind', data.value?.widget?.upload ?? 'other'); for (const f of fs) fd.append('file', f)
  busy.value = true; err.value = ''
  try { data.value = await $fetch<View>('/api/w/onboard', { method: 'POST', body: fd }) } catch (e) { err.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upload.' } finally { busy.value = false; if (file.value) file.value.value = '' }
}
// Messages: plain text with **bold** and line breaks.
const html = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
const money = (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: data.value?.plan.currency ?? 'USD', maximumFractionDigits: 0 }).format(Math.round(v)))
const pct = (v: number) => Math.max(2, Math.min(100, v * 100)) + '%'
const p = computed(() => data.value?.plan ?? {})
const canAgree = computed(() => (data.value?.widget?.items ?? []).every((i) => !i.required || agree[i.key]))
async function signOut() { try { await $fetch('/api/auth/logout', { method: 'POST' }) } catch { /* ignore */ } await navigateTo('/login') }
const acctLine = computed(() => ({ opened: 'Investing account open', waiting: 'Investing account being opened', failed: 'Investing account: your adviser is finishing it', held: 'Investing account: your adviser will be in touch', not_needed: data.value?.country === 'NG' ? 'Wallet and savings ready to set up' : '' } as Record<string, string>)[data.value?.account_status ?? ''] ?? '')
</script>
<template>
  <div class="ob">
    <header class="top"><b>Aidi Wealth</b><span><span v-if="data?.status === 'in_progress'" class="mut">Setting up · {{ data.phases[data.phase] }}</span><button class="lk" @click="signOut">Sign out</button></span></header>
    <p v-if="error" class="pad mut">We couldn't load your account. Please sign in again.</p>
    <main v-else-if="data && data.status === 'in_progress'" class="lay">
      <aside class="card rail">
        <div class="rh"><b>Setting up your account</b><span class="mut">About 8 minutes · pick up where you left off any time</span><span class="pb"><i :style="{ width: (data.phase / (data.phases.length - 1)) * 100 + '%' }" /></span></div>
        <ol><li v-for="(ph, i) in data.phases" :key="ph" :class="{ done: i < data.phase, now: i === data.phase }"><span class="nb">{{ i < data.phase ? '✓' : i + 1 }}</span>{{ ph }}</li></ol>
        <p class="fine">Your answers are private to you and your adviser. You can change any of them later.</p>
      </aside>
      <section class="card chat">
        <div ref="box" class="msgs" aria-live="polite">
          <template v-for="(m, i) in data.messages" :key="i"><div v-if="m.role === 'ai'" class="ai"><span class="av" aria-hidden="true">A</span><div class="bub" v-html="html(m.text)" /></div><div v-else class="me">{{ m.text }}</div></template>
          <div v-if="busy" class="ai"><span class="av" aria-hidden="true">A</span><div class="bub"><span class="typing" aria-label="Typing"><i /><i /><i /></span></div></div>
          <div v-else-if="data.widget" class="wg">
            <template v-if="data.widget.kind === 'choice'"><div class="chips"><button v-for="o in data.widget.options" :key="o.value" @click="send({ value: { choice: o.value } })">{{ o.label }}</button></div></template>
            <template v-else-if="data.widget.kind === 'form'"><form class="inl" @submit.prevent="send({ value: { ...form } })"><div class="fg"><label v-for="f in data.widget.fields" :key="f.key">{{ f.label }}<input v-model="form[f.key]" :type="f.type === 'secret' ? 'password' : f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'" :inputmode="f.type === 'secret' || f.type === 'number' ? 'numeric' : undefined" :placeholder="f.placeholder" :autocomplete="f.type === 'secret' ? 'off' : undefined" min="0"></label></div><div class="act"><button class="btn" type="submit">{{ data.widget.submit ?? 'Continue' }}</button></div></form></template>
            <template v-else-if="data.widget.kind === 'rows'"><div class="inl">
              <div class="chips flat"><button v-for="q in data.widget.quick" :key="q.label" type="button" @click="addRow(q.row)">+ {{ q.label }}</button></div>
              <div v-if="rows.length" class="rt" :style="{ gridTemplateColumns: data.widget.columns!.map((c) => (c.type === 'text' ? 'minmax(0, 1.6fr)' : 'minmax(0, 1fr)')).join(' ') + ' 28px' }">
                <span v-for="c in data.widget.columns" :key="'h' + c.key" class="rl">{{ c.label }}</span><span />
                <template v-for="(r, ri) in rows" :key="ri"><template v-for="c in data.widget.columns" :key="c.key"><select v-if="c.type === 'select'" v-model="r[c.key]" :aria-label="c.label"><option v-for="o in c.options" :key="o[0]" :value="o[0]">{{ o[1] }}</option></select><input v-else v-model="r[c.key]" :type="c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'" :placeholder="c.placeholder" :aria-label="c.label" min="0"></template><button type="button" class="x" aria-label="Remove" @click="rows.splice(ri, 1)">×</button></template>
              </div>
              <div class="act"><button class="btn" :disabled="!rows.length" @click="submitRows">{{ data.widget.submit ?? 'Done' }}</button><button v-if="data.widget.skip" class="btn2" @click="send({ value: { skip: true } })">{{ data.widget.skip }}</button><template v-if="data.widget.upload"><button class="btn2" @click="file?.click()">Upload a statement</button><input ref="file" type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx" @change="upload"></template></div></div></template>
            <template v-else-if="data.widget.kind === 'scale'"><div class="inl"><div class="scale"><button v-for="o in data.widget.options" :key="o.value" :class="{ on: pick === o.value }" @click="pick = o.value"><b>{{ o.label }}</b><em v-if="o.value === data.widget.suggested">Suggested</em></button></div><span class="mut sm">{{ data.widget.options?.find((o) => o.value === pick)?.note }}</span><div class="act"><button class="btn" :disabled="!pick" @click="send({ value: { level: pick } })">Use {{ data.widget.options?.find((o) => o.value === pick)?.label ?? '' }}</button></div></div></template>
            <template v-else-if="data.widget.kind === 'agree'"><div class="inl"><label v-for="it in data.widget.items" :key="it.key" class="cb"><input v-model="agree[it.key]" type="checkbox"> {{ it.label }}</label><div class="act"><button class="btn" :disabled="!canAgree" @click="send({ value: { ...agree } })">{{ data.widget.submit }}</button></div></div></template>
            <button v-if="data.can_back" class="lk back" @click="send({ back: true })">← Change my last answer</button>
          </div>
        </div>
        <p v-if="err" class="error">{{ err }}</p>
        <form class="comp" @submit.prevent="sendText"><input v-model="text" :type="data.step === 'ssn' || data.step === 'bvn' ? 'password' : 'text'" :placeholder="data.step === 'agree' ? 'Ask me anything about the account…' : 'Type your answer in your own words…'" :disabled="busy" aria-label="Your answer" autocomplete="off"><button class="btn" :disabled="busy || !text.trim()">Send</button></form>
      </section>
      <aside class="card plan">
        <b>Your plan so far</b><span class="mut sm">Fills in as we talk</span>
        <div class="fl"><span>Income</span><span class="br"><i :style="{ width: p.income ? '100%' : '0' }" /></span><b>{{ money(p.income) }}</b>
          <span>Spending</span><span class="br"><i class="s" :style="{ width: p.income && p.spending != null ? pct(p.spending / p.income) : '0' }" /></span><b>{{ money(p.spending) }}</b>
          <span>Saved</span><span class="br"><i class="v" :style="{ width: p.income && p.saved != null ? pct(p.saved / p.income) : '0' }" /></span><b>{{ p.rate != null ? Math.round(p.rate * 100) + '%' : '—' }}</b></div>
        <div class="pk"><span>What you own</span><b>{{ money(p.owns) }}</b></div>
        <div class="pk"><span>Debts</span><b>{{ money(p.debts) }}</b></div>
        <div class="pk"><span>Goals</span><b>{{ p.goals?.length ? p.goals.join(', ') : '—' }}</b></div>
        <div class="pk"><span>Risk level</span><b>{{ p.risk ?? '—' }}</b></div>
      </aside>
    </main>
    <main v-else-if="data && data.status === 'done'" class="fin card">
      <h1>You're all set{{ data.first ? ', ' + data.first : '' }}</h1><p class="mut">Your dashboard is ready.</p>
      <ul><li class="ok"><span class="nb">✓</span><div><b>Financial plan created</b><em>Your review is being prepared; your adviser adds their notes.</em></div></li>
        <li v-if="p.risk" class="ok"><span class="nb">✓</span><div><b>Risk level: {{ p.risk }}</b><em>Set by you; your adviser can talk it through with you.</em></div></li>
        <li v-if="acctLine" :class="data.account_status === 'opened' ? 'ok' : 'now'"><span class="nb">{{ data.account_status === 'opened' ? '✓' : p.risk ? 3 : 2 }}</span><div><b>{{ acctLine }}</b><em>{{ data.account_status === 'opened' ? 'The identity check usually takes minutes.' : data.account_status === 'not_needed' ? 'Set it up from your dashboard when you are ready.' : 'Nothing for you to do now.' }}</em></div></li>
        <li class="now"><span class="nb">{{ 2 + (p.risk ? 1 : 0) + (acctLine ? 1 : 0) }}</span><div><b>Ready to invest</b><em>Add money, then invest from your dashboard.</em></div></li></ul>
      <NuxtLink to="/w" class="btn big">Go to my dashboard</NuxtLink>
    </main>
    <main v-else-if="data && data.status === 'submitted'" class="fin card">
      <h1>Thanks{{ data.first ? ', ' + data.first : '' }}. We're reviewing</h1><p class="mut">An adviser looks at your answers, usually within one working day. We'll email you as soon as your dashboard opens.</p>
      <ul><li class="ok"><span class="nb">✓</span><div><b>Your answers are saved</b><em>Plan details, risk level{{ data.country === 'US' ? ' and investing account details' : '' }}</em></div></li>
        <li class="now"><span class="nb">2</span><div><b>Adviser review</b><em>Checking your plan and that we're the right fit</em></div></li>
        <li><span class="nb">3</span><div><b>{{ data.country === 'US' ? 'Investing account opened' : 'Wallet and savings set up' }}</b><em>Once approved</em></div></li>
        <li><span class="nb">4</span><div><b>Dashboard opens</b><em>You'll get an email with a sign-in link</em></div></li></ul>
      <p class="mut sm">If anything changes in the meantime, reply to our email.</p>
    </main>
    <main v-else-if="data && data.status === 'declined'" class="fin card"><h1>Thank you for your interest</h1><p class="mut">We've emailed you about your request. If your situation changes, you're welcome to ask again.</p></main>
  </div>
</template>
<style scoped>
.ob { min-height: var(--vh100, 100vh); background: var(--c-paper-2); display: flex; flex-direction: column; font-size: 14.5px; }
.top { display: flex; justify-content: space-between; align-items: center; padding: 14px 28px; background: #fff; border-bottom: 1px solid var(--c-rule); font-size: 13px; } .top b { color: var(--c-navy); font-size: 16px; } .top > span { display: flex; gap: 16px; align-items: center; }
.mut { color: var(--c-muted); } .sm { font-size: 12.5px; } .pad { padding: 24px; } .error { color: var(--c-danger); margin: 0; padding: 0 22px 8px; font-size: 13px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; }
.card { background: #fff; border: 1px solid var(--c-rule); }
.lay { flex: 1; width: 100%; max-width: 1320px; margin: 0 auto; padding: 20px 24px; box-sizing: border-box; display: grid; grid-template-columns: 250px minmax(0, 1fr) 280px; gap: 16px; align-items: start; }
.rail { position: sticky; top: 16px; } .rh { padding: 16px 16px 8px; display: flex; flex-direction: column; gap: 3px; } .rh .mut { font-size: 12.5px; } .pb { display: block; height: 6px; background: #e6ecf2; margin-top: 10px; } .pb i { display: block; height: 100%; background: var(--c-blue-deep); }
.rail ol { list-style: none; margin: 0; padding: 4px 8px 10px; } .rail li { display: flex; gap: 10px; align-items: center; padding: 8px; color: var(--c-ink-soft); } .rail li.now { background: var(--c-paper-2); color: var(--c-ink); font-weight: 500; }
.nb { width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--c-rule-strong); font-size: 12px; color: var(--c-blue-deep); } li.done .nb, li.ok .nb { border-color: var(--c-blue-deep); } li.now .nb { background: var(--c-navy); border-color: var(--c-navy); color: #fff; }
.fine { margin: 0; padding: 12px 16px; border-top: 1px solid var(--c-rule); font-size: 12px; color: var(--c-muted); }
.chat { display: flex; flex-direction: column; height: calc(var(--vh100, 100vh) - 100px); min-height: 520px; }
.msgs { flex: 1; overflow-y: auto; padding: 22px; display: flex; flex-direction: column; gap: 14px; }
.ai { display: flex; gap: 10px; align-items: flex-start; max-width: 640px; } .av { width: 28px; height: 28px; flex: none; background: var(--c-navy); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
.bub { background: #fff; border: 1px solid var(--c-rule); padding: 11px 14px; line-height: 1.55; } .me { align-self: flex-end; background: #e6ecf2; color: var(--c-navy); padding: 10px 14px; max-width: 480px; line-height: 1.5; }
.typing { display: inline-flex; gap: 4px; } .typing i { width: 6px; height: 6px; background: #9aa3ad; animation: bl 1.2s infinite; } .typing i:nth-child(2) { animation-delay: .2s; } .typing i:nth-child(3) { animation-delay: .4s; } @keyframes bl { 0%, 100% { opacity: .3 } 50% { opacity: 1 } }
.wg { display: flex; flex-direction: column; gap: 8px; margin-left: 38px; max-width: 620px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips button { font: inherit; font-size: 13.5px; padding: 8px 12px; border: 1px solid var(--c-rule-strong); background: #fff; cursor: pointer; color: var(--c-ink); text-align: left; } .chips button:hover { border-color: var(--c-navy); } .chips.flat button { font-size: 12.5px; padding: 5px 10px; }
.inl { background: #fafaf8; border: 1px solid var(--c-rule); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.fg { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; } label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--c-muted); }
input, select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); box-sizing: border-box; width: 100%; min-width: 0; }
.rt { display: grid; gap: 6px; align-items: center; } .rl { font-size: 12px; color: var(--c-muted); } .x { background: none; border: 0; font-size: 18px; color: var(--c-muted); cursor: pointer; }
.act { display: flex; gap: 8px; flex-wrap: wrap; } .btn2 { font: inherit; font-size: 13px; padding: 7px 12px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); cursor: pointer; }
.scale { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; } .scale button { font: inherit; text-align: left; padding: 10px 8px; border: 0; border-top: 4px solid #e6ecf2; background: #fff; cursor: pointer; font-size: 12.5px; color: var(--c-muted); } .scale button b { display: block; font-weight: 500; } .scale button em { display: block; font-style: normal; font-size: 11.5px; color: var(--c-blue-deep); margin-top: 2px; } .scale button.on { border-top-color: var(--c-navy); color: var(--c-ink); }
.cb { flex-direction: row; gap: 8px; align-items: flex-start; font-size: 13.5px; color: var(--c-ink); } .cb input { width: auto; margin-top: 3px; }
.back { align-self: flex-start; font-size: 12.5px; }
.comp { display: flex; gap: 8px; padding: 14px 22px 18px; border-top: 1px solid var(--c-rule); } .comp input { flex: 1; }
.plan { position: sticky; top: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; } .plan > b { font-size: 15px; }
.fl { display: grid; grid-template-columns: 62px minmax(0, 1fr) 70px; gap: 8px; align-items: center; font-size: 13px; } .fl > span:not(.br) { color: var(--c-muted); } .fl b { text-align: right; font-weight: 600; }
.br { display: block; height: 12px; background: #eef2f6; } .br i { display: block; height: 100%; background: var(--c-blue-deep); transition: width .4s; } .br i.s { background: #6e737b; } .br i.v { background: var(--c-navy); }
.pk { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding-top: 8px; border-top: 1px solid var(--c-rule); } .pk span { color: var(--c-muted); } .pk b { text-align: right; font-weight: 600; } .pk em { font-style: normal; color: var(--c-muted); font-size: 12px; }
.pk:first-of-type { border-top: 0; padding-top: 0; }
.fin { width: calc(100% - 32px); max-width: 620px; margin: 40px auto; padding: 28px; box-sizing: border-box; } .fin h1 { margin: 0 0 4px; font-size: 24px; } .fin ul { list-style: none; margin: 16px 0; padding: 0; } .fin li { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--c-rule); } .fin li b { display: block; font-weight: 500; } .fin li em { display: block; font-style: normal; font-size: 12.5px; color: var(--c-muted); }
.btn.big { display: inline-block; padding: 10px 16px; text-decoration: none; }
@media (max-width: 1100px) { .lay { grid-template-columns: minmax(0, 1fr) 260px; } .rail { display: none; } }
@media (max-width: 760px) { .lay { grid-template-columns: 1fr; padding: 12px; } .plan { position: static; order: -1; } .chat { height: auto; min-height: 70vh; } .wg { margin-left: 0; } .scale { grid-template-columns: 1fr 1fr; } .top { padding: 12px 16px; } }
</style>
