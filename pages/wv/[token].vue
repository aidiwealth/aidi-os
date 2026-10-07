<script setup lang="ts">
// Family view of a household's holdings: name and email first (the household is told), then a read-only summary.
definePageMeta({ layout: 'public' })
const token = useRoute().params.token as string
const f = reactive({ name: '', email: '' }); const data = ref<Record<string, any> | null>(null); const msg = ref(''); const busy = ref(false); const household = ref('')
onMounted(async () => { try { const r = await $fetch<Record<string, any>>('/api/public/wv/' + token, { method: 'POST', body: {} }); household.value = r.household } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'This link is not valid.' } })
async function open() { busy.value = true; msg.value = ''; try { const r = await $fetch<Record<string, any>>('/api/public/wv/' + token, { method: 'POST', body: { ...f } }); if (!r.need) data.value = r } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not open.' } finally { busy.value = false } }
const money = (v: number | string | null, c: string) => (v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v)))
useHead({ title: 'Family view · Aidi Wealth', meta: [{ name: 'robots', content: 'noindex' }] })
</script>
<template>
  <div class="wrap"><p class="label">Aidi Wealth · family view</p><h1>{{ data?.household ?? household ?? '' }}</h1>
    <form v-if="!data && !msg.startsWith('This link')" class="card gate" @submit.prevent="open"><p>Enter your name and email to view. The household is told who viewed.</p><input v-model="f.name" required maxlength="120" placeholder="Your name"><input v-model="f.email" type="email" required maxlength="254" placeholder="Your email"><button class="btn" :disabled="busy">{{ busy ? 'Opening…' : 'View' }}</button></form>
    <p v-if="msg" class="error">{{ msg }}</p>
    <template v-if="data"><WealthSummary :s="data.summary" /><div class="card tc"><table class="table"><thead><tr><th>Holding</th><th>Type</th><th>Where</th><th class="n">Value</th></tr></thead><tbody><tr v-for="(h, i) in data.summary.holdings" :key="i"><td>{{ h.name }}</td><td>{{ h.category.replace('_', ' ') }}</td><td>{{ h.platform ?? '—' }}</td><td class="n">{{ money(h.current_value, h.currency) }}</td></tr></tbody></table></div><p class="disc">Read-only. Information only, not investment advice.</p></template></div>
</template>
<style scoped>
.wrap { max-width: 1000px; margin: 0 auto; padding: 28px 18px; } h1 { margin: 2px 0 16px; } .gate { display: flex; flex-direction: column; gap: 10px; max-width: 420px; } .gate input { font: inherit; padding: 9px 11px; border: 1px solid var(--c-rule-strong); } .error { color: var(--c-danger); }
.tc { padding: 0; overflow-x: auto; margin-top: 12px; } .table { width: 100%; border-collapse: collapse; font-size: 13.5px; } .table th { text-align: left; padding: 10px 14px; } .table td { padding: 10px 14px; border-bottom: 1px solid var(--c-rule); } .n { text-align: right; } .disc { font-size: 12px; color: var(--c-muted); }
</style>
