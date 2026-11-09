<script setup lang="ts">
// Shared financial review: name and email first (the client is told who opened it), then the review, read-only.
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
const f = reactive({ name: '', email: '' }); const data = ref<Record<string, any> | null>(null); const msg = ref(''); const busy = ref(false); const first = ref(''); const dead = ref(false)
onMounted(async () => { try { first.value = (await $fetch<Record<string, any>>('/api/public/wr/' + token, { method: 'POST', body: {} })).first ?? '' } catch (e) { dead.value = true; msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'This link is not valid.' } })
async function open() { busy.value = true; msg.value = ''; try { const r = await $fetch<Record<string, any>>('/api/public/wr/' + token, { method: 'POST', body: { ...f } }); if (!r.need) data.value = r } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open.' } finally { busy.value = false } }
useHead({ title: 'Financial review · Aidi Wealth', meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <div v-if="!data" class="gw">
    <div class="gc">
      <span class="ey">Financial review · shared privately</span>
      <h1>{{ dead ? 'This link can\'t be opened' : (first ? first + ' has' : 'Someone has') + ' shared a financial review with you' }}</h1>
      <p v-if="!dead" class="lead">Enter your name and email to open it. {{ first || 'They' }} will see who opened it and when.</p>
      <form v-if="!dead" class="card gate" @submit.prevent="open">
        <label>Your name<input v-model="f.name" required maxlength="120" autocomplete="name"></label>
        <label>Your email<input v-model="f.email" type="email" required maxlength="254" autocomplete="email"></label>
        <button class="btn" :disabled="busy">{{ busy ? 'Opening…' : 'Open the review' }}</button>
      </form>
      <p v-if="msg" class="error">{{ msg }}</p>
      <ul v-if="!dead" class="pts"><li>Read-only. You can't change anything.</li><li>No account numbers or identity details are shown.</li><li>{{ first || 'They' }} can turn this link off at any time; it expires after 90 days.</li></ul>
    </div>
  </div>
  <div v-else class="wrap"><p class="ey">Financial review · shared by {{ first }}</p><h1 class="hh">{{ data.household }}</h1>
    <FinancialReport v-if="data.report" :report="data.report.content" :history="data.history" :prepared="data.report.created_at" ro /><p v-else class="mut">No review has been prepared yet.</p></div>
</template>
<style scoped>
.gw { display: flex; justify-content: center; } .gc { width: 100%; max-width: 460px; display: flex; flex-direction: column; gap: 16px; }
.ey { font-size: 13px; color: var(--c-muted); margin: 0; } h1 { margin: 0; font-size: 28px; line-height: 1.2; color: var(--c-navy); } .lead { margin: 0; color: var(--c-ink-soft); }
.gate { display: flex; flex-direction: column; gap: 14px; padding: 24px; } .gate label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--c-ink-soft); } .gate input { font: inherit; font-size: 15px; padding: 11px 12px; border: 1px solid var(--c-rule-strong); } .gate .btn { min-height: 46px; }
.pts { margin: 0; padding-left: 18px; font-size: 13px; color: var(--c-muted); display: flex; flex-direction: column; gap: 4px; } .error { color: var(--c-danger); margin: 0; } .mut { color: var(--c-muted); }
.wrap { max-width: 1120px; margin: 0 auto; } .hh { margin: 2px 0 16px; }
</style>
