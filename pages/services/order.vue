<script setup lang="ts">
// Order services for a client — the same steps the client sees in Finvry (Start a company, filings, address…),
// with the team able to override prices and record how it was paid.
useHead({ title: 'New order' })
const route = useRoute()
const { data: clients, refresh } = await useFetch<{ id: string; name: string; contact_name: string; email: string }[]>('/api/services/clients')
const clientId = ref(String(route.query.client ?? ''))
const adding = ref(false), busy = ref(false), msg = ref('')
const nc = reactive({ name: '', contact_name: '', email: '', country: 'United States', kind: 'company' as 'company' | 'individual' })
const client = computed(() => (clients.value ?? []).find((c) => c.id === clientId.value) ?? null)
const key = ref(0)
watch(clientId, () => { key.value++; if (clientId.value) navigateTo({ query: { client: clientId.value } }, { replace: true }) })
async function addClient() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ id: string }>('/api/services/clients', { method: 'POST', body: { ...nc, status: 'active' } }); await refresh(); clientId.value = r.id; adding.value = false }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not add the client.' } finally { busy.value = false }
}
</script>
<template>
  <section>
    <CsNav />
    <div class="head"><div><p class="label">Client Services</p><h1>New order</h1><p class="lead">The same steps your clients see in Finvry. Pick the client, choose the services and fill in the details — or leave the details for the client. You can change prices and record a payment made by bank transfer or an older order.</p></div></div>
    <div class="card pick">
      <label class="label">Client<select v-model="clientId"><option value="">Choose a client</option><option v-for="c in clients ?? []" :key="c.id" :value="c.id">{{ c.name }} — {{ c.contact_name }}</option></select></label>
      <button type="button" class="btn secondary" @click="adding = !adding">{{ adding ? 'Cancel' : '+ New client' }}</button>
      <NuxtLink v-if="client" :to="'/services/clients/' + client.id" class="lk">Open {{ client.name }} →</NuxtLink>
    </div>
    <form v-if="adding" class="card nc" @submit.prevent="addClient">
      <label class="label">Client name<input v-model="nc.name" required maxlength="200" placeholder="Company or person"></label>
      <label class="label">Contact name<input v-model="nc.contact_name" required maxlength="200"></label>
      <label class="label">Email<input v-model="nc.email" type="email" required maxlength="254"></label>
      <label class="label">Country<CountrySelect v-model="nc.country" /></label>
      <div class="row"><button class="btn" type="submit" :disabled="busy">{{ busy ? 'Adding…' : 'Add client' }}</button><span v-if="msg" class="error">{{ msg }}</span></div>
    </form>
    <div v-if="client" class="card wz"><OrderWizard :key="key" :client-id="client.id" @done="(id: string) => navigateTo('/services/' + id)" /></div>
    <EmptyState v-else-if="!adding" card icon="services" title="Choose a client to start" text="Or add a new client. The order is created on the services desk exactly as if the client had placed it in Finvry." />
  </section>
</template>
<style scoped>
.head { margin-bottom: 14px; } .head h1 { margin: 0; } .lead { color: var(--c-muted); max-width: 820px; margin: 4px 0 0; }
.pick { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 14px; } .pick .label { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 280px; } .lk { color: var(--c-blue-deep); font-size: 13.5px; margin-bottom: 10px; }
select, input { font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--c-rule-strong); background: #fff; }
.nc { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; } .nc .label { display: flex; flex-direction: column; gap: 6px; } .nc .row { grid-column: 1 / -1; display: flex; gap: 10px; align-items: center; } .error { color: var(--c-danger); font-size: 13px; }
.wz { padding: 22px; }
@media (max-width: 700px) { .nc { grid-template-columns: 1fr; } }
</style>
