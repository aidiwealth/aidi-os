<script setup lang="ts">
// A locked page on the Free plan: a blurred preview of what the page holds, what it offers, and an upgrade call.
const props = defineProps<{ code: string; label: string }>()
interface P { code: string; name: string; usd: number | null; ngn: number | null }
const { data } = await useFetch<{ currency: string; status: string; trial_used: boolean; plans: P[] }>('/api/company/profile', { key: 'company-profile' })
const FEAT: Record<string, { title: string; lede: string; points: string[]; kind: string }> = {
  updates: { title: 'Investor updates', lede: 'Keep investors close with polished monthly and quarterly updates, drafted by AI from your numbers.', kind: 'doc',
    points: ['Block editor with charts straight from your Financials', 'AI writes the first draft from your figures and notes', 'Send to lists or pipeline stages, with a test send and preview', 'See who opened, when and how often', 'Templates, duplicates and publishing to your investor page'] },
  fundraising: { title: 'Fundraising', lede: 'Run your raise in one place: pipelines, a tracked data room, an AI deal memo and SAFEs.', kind: 'pipe',
    points: ['Pipelines with custom stages, targets and committed totals', 'Data room with tracked links, NDA and watermarking', 'AI-written deal memo from your numbers', 'SAFE term sheets with ownership worked out', 'Short branded links like app.finvry.com/you/deck'] },
  contacts: { title: 'Contacts', lede: 'Your investor CRM: everyone you talk to, what they opened and where they are in your raise.', kind: 'table',
    points: ['Lists, custom properties and subscribe status', 'Engagement chart for every contact', 'Every update open and data room view logged', 'Notes, pipelines and shared items on one page', 'Import your list in one paste'] } }
const f = computed(() => FEAT[props.code] ?? { title: props.label, lede: 'This feature is part of our paid plans.', kind: 'table', points: ['Everything in your current plan', 'More team members, AI and storage', 'Priority service'] })
const startup = computed(() => data.value?.plans.find((p) => p.code === 'company_startup'))
const ngn = computed(() => data.value?.currency === 'NGN')
const price = computed(() => { const p = startup.value; if (!p) return ''; const v = ngn.value ? p.ngn : p.usd; return v ? (ngn.value ? '₦' : '$') + v.toLocaleString('en-US') : '' })
const trial = computed(() => !!data.value && !data.value.trial_used && data.value.status !== 'trial')
const busy = ref(false); const msg = ref('')
async function upgrade() { busy.value = true; msg.value = ''; try { await $fetch('/api/company/plan', { method: 'POST', body: { plan: 'company_startup' } }); await refreshNuxtData(); window.location.reload() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not upgrade.'; busy.value = false } }
</script>
<template>
  <section class="pw">
    <p class="label">{{ f.title }}</p>
    <div class="stage">
      <div class="ghost" aria-hidden="true">
        <div class="gh"><i class="t w40" /><i class="b w12" /></div>
        <template v-if="f.kind === 'doc'"><div class="gcard"><i class="t w60" /><i class="l" /><i class="l w80" /><div class="bars"><i v-for="n in 6" :key="n" :style="{ width: 30 + n * 10 + '%' }" /></div><i class="l w70" /><i class="l w50" /></div><div class="grow"><div v-for="n in 4" :key="n" class="gcard sm"><i class="t w50" /><i class="l w80" /></div></div></template>
        <template v-else-if="f.kind === 'pipe'"><div class="cols"><div v-for="n in 5" :key="n" class="col"><i class="t w60" /><div v-for="k in (n % 3) + 1" :key="k" class="gcard sm"><i class="l w70" /><i class="l w40" /></div></div></div></template>
        <template v-else><div class="gcard"><div v-for="n in 7" :key="n" class="row"><span class="av" /><i class="l w30" /><i class="l w20" /><i class="chip" /></div></div></template>
      </div>
      <div class="veil" />
      <div class="card">
        <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></div>
        <h2>{{ f.title }} is a <em>Startup</em> feature</h2>
        <p class="lede">{{ f.lede }}</p>
        <ul><li v-for="p in f.points" :key="p"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 10.5l4 4 8-9" /></svg>{{ p }}</li></ul>
        <div class="price" v-if="price"><b>{{ price }}</b><span>/ month · Startup plan</span></div>
        <button class="btn go" :disabled="busy" @click="upgrade">{{ busy ? 'Unlocking…' : trial ? 'Start your 14-day free trial' : 'Upgrade to Startup' }}</button>
        <span class="sub">{{ trial ? 'No card needed. Cancel any time.' : 'Billed from your wallet or card on file.' }}</span>
        <NuxtLink to="/settings?s=plan" class="cmp">Compare plans →</NuxtLink>
        <p v-if="msg" class="error">{{ msg }}</p>
      </div>
    </div>
  </section>
</template>
<style scoped>
.pw { position: relative; } .stage { position: relative; min-height: 640px; overflow: hidden; border-radius: 0; }
.ghost { filter: blur(6px); opacity: .75; pointer-events: none; user-select: none; display: flex; flex-direction: column; gap: 14px; padding: 4px; }
.ghost i { display: block; background: #dedbd2; height: 10px; margin: 7px 0; } .ghost .t { height: 16px; background: #c9c5ba; } .ghost .b { height: 34px; background: var(--c-navy); opacity: .55; }
.w12 { width: 12%; } .w20 { width: 20%; } .w30 { width: 30%; } .w40 { width: 40%; } .w50 { width: 50%; } .w60 { width: 60%; } .w70 { width: 70%; } .w80 { width: 80%; }
.gh { display: flex; justify-content: space-between; align-items: center; } .gcard { background: #fff; border: 1px solid var(--c-rule); padding: 18px; } .gcard.sm { padding: 12px; } .grow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.bars i { height: 14px; background: linear-gradient(90deg, #1c3d63, #5b8fd1); margin: 6px 0; } .cols { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; } .col { background: var(--c-paper-2); padding: 10px; min-height: 360px; display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; gap: 14px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--c-rule); } .row .av { width: 28px; height: 28px; border-radius: 50%; background: #e3def7; flex: none; } .row .chip { width: 70px; height: 18px; background: #d8ecdf; margin-left: auto; }
.veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(251,250,247,.35) 0%, rgba(251,250,247,.82) 55%, rgba(251,250,247,.96) 100%); }
.card { position: absolute; left: 50%; top: 48px; transform: translateX(-50%); width: min(500px, calc(100% - 32px)); background: #fff; border: 1px solid var(--c-rule); box-shadow: 0 18px 60px rgba(12, 26, 46, .14); padding: 32px 34px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.ic { width: 48px; height: 48px; border-radius: 14px; background: var(--c-signal-soft); color: var(--c-blue-deep); display: grid; place-items: center; margin-bottom: 16px; } .ic svg { width: 22px; height: 22px; }
.card h2 { font-size: 26px; margin: 0 0 8px; color: var(--c-ink); } .card h2 em { font-style: italic; color: var(--c-blue-deep); } .lede { font-size: 14.5px; color: var(--c-ink-soft); line-height: 1.55; margin: 0 0 18px; }
ul { list-style: none; padding: 0; margin: 0 0 20px; text-align: left; width: 100%; display: flex; flex-direction: column; gap: 9px; } li { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; color: var(--c-ink); } li svg { width: 18px; height: 18px; color: var(--c-ok); flex: none; margin-top: 1px; }
.price { display: flex; gap: 6px; align-items: baseline; margin-bottom: 14px; } .price b { font-size: 30px; font-weight: 600; color: var(--c-ink); } .price span { font-size: 13px; color: var(--c-muted); }
.btn.go { width: 100%; padding: 13px; font-size: 15px; font-weight: 600; } .sub { font-size: 12.5px; color: var(--c-muted); margin-top: 8px; } .cmp { font-size: 13.5px; margin-top: 14px; color: var(--c-blue-deep); } .error { color: var(--c-danger); margin: 10px 0 0; font-size: 13px; }
@media (max-width: 760px) { .grow, .cols { grid-template-columns: 1fr 1fr; } .card { padding: 24px 20px; } }
</style>
