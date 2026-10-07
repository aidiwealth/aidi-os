<script setup lang="ts">
// Shared financial review: name and email first (the household is told), then the review and growth.
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
const f = reactive({ name: '', email: '' }); const data = ref<Record<string, any> | null>(null); const msg = ref(''); const busy = ref(false); const household = ref('')
onMounted(async () => { try { household.value = (await $fetch<Record<string, any>>('/api/public/wr/' + token, { method: 'POST', body: {} })).household } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'This link is not valid.' } })
async function open() { busy.value = true; msg.value = ''; try { const r = await $fetch<Record<string, any>>('/api/public/wr/' + token, { method: 'POST', body: { ...f } }); if (!r.need) data.value = r } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open.' } finally { busy.value = false } }
useHead({ title: 'Financial review · Aidi Wealth', meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <div class="wrap"><p class="label">Aidi Wealth · financial review</p><h1>{{ data?.household ?? household }}</h1>
    <form v-if="!data && !msg.startsWith('This link')" class="card gate" @submit.prevent="open"><p>Enter your name and email to view. The household is told who viewed.</p><input v-model="f.name" required maxlength="120" placeholder="Your name"><input v-model="f.email" type="email" required maxlength="254" placeholder="Your email"><button class="btn" :disabled="busy">{{ busy ? 'Opening…' : 'View' }}</button></form>
    <p v-if="msg" class="error">{{ msg }}</p>
    <FinancialReport v-if="data?.report" :report="data.report.content" :history="data.history" /><p v-else-if="data" class="mut">No review has been prepared yet.</p></div>
</template>
<style scoped>
.wrap { max-width: 1060px; margin: 0 auto; padding: 28px 18px; } h1 { margin: 2px 0 16px; } .gate { display: flex; flex-direction: column; gap: 10px; max-width: 420px; } .gate input { font: inherit; padding: 9px 11px; border: 1px solid var(--c-rule-strong); } .error { color: var(--c-danger); } .mut { color: var(--c-muted); }
</style>
