<script setup lang="ts">
useHead({ title: 'Finvry · Plans & pricing' })
interface Plan { code: string; name: string; description: string | null; modules: string[]; seat_limit: number | null; storage_gb: number | null; ai_runs_month: number | null; price_monthly: string | null; price_annual: string | null; public: boolean; active: boolean; sort: number; customers: number }
const { data, refresh } = await useFetch<{ plans: Plan[]; modules: { code: string; label: string; group: string }[] }>('/api/platform/plans')
const editing = ref<string | null>(null)
const f = reactive({ code: '', name: '', description: '', modules: [] as string[], seat_limit: '' as string | number, storage_gb: '' as string | number, ai_runs_month: '' as string | number, price_monthly: '' as string | number, price_annual: '' as string | number, public: true, active: true, sort: 5 })
function edit(p?: Plan) {
  Object.assign(f, p ? { code: p.code, name: p.name, description: p.description ?? '', modules: [...p.modules], seat_limit: p.seat_limit ?? '', storage_gb: p.storage_gb ?? '', ai_runs_month: p.ai_runs_month ?? '', price_monthly: p.price_monthly ?? '', price_annual: p.price_annual ?? '', public: p.public, active: p.active, sort: p.sort }
    : { code: '', name: '', description: '', modules: [], seat_limit: '', storage_gb: '', ai_runs_month: '', price_monthly: '', price_annual: '', public: true, active: true, sort: 5 })
  editing.value = p?.code ?? 'new'
}
const msg = ref('')
async function save() {
  msg.value = ''
  try { await $fetch('/api/platform/plans', { method: 'POST', body: { ...f } }); editing.value = null; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' }
}
const label = (code: string) => data.value?.modules.find((m) => m.code === code)?.label ?? code
const groups = computed(() => { const g: Record<string, { code: string; label: string }[]> = {}; for (const m of data.value?.modules ?? []) (g[m.group] ??= []).push(m); return Object.entries(g) })
const lim = (v: number | null, unit = '') => (v === null ? 'Unlimited' : v.toLocaleString() + unit)
</script>

<template>
  <section v-if="data">
    <p class="label">Finvry platform</p>
    <div class="head"><h1>Plans &amp; pricing</h1><button class="btn" type="button" @click="edit()">New plan</button></div>
    <p class="lead">Each plan sets the modules a workspace gets and its limits. Changes apply straight away to every workspace on the plan.</p>
    <form v-if="editing" class="card frm" @submit.prevent="save">
      <label class="label">Code<input v-model="f.code" required pattern="[a-z][a-z0-9_]{1,30}" :readonly="editing !== 'new'"></label>
      <label class="label">Name<input v-model="f.name" required maxlength="80"></label>
      <label class="label">Order<input v-model.number="f.sort" type="number" min="0" max="99"></label>
      <label class="label wide">Description<input v-model="f.description" maxlength="300"></label>
      <label class="label">Price per month (USD)<input v-model="f.price_monthly" inputmode="decimal" placeholder="blank = not listed"></label>
      <label class="label">Price per year (USD)<input v-model="f.price_annual" inputmode="decimal"></label>
      <label class="label">Seats<input v-model="f.seat_limit" inputmode="numeric" placeholder="blank = unlimited"></label>
      <label class="label">Storage (GB)<input v-model="f.storage_gb" inputmode="numeric" placeholder="blank = unlimited"></label>
      <label class="label">AI runs per month<input v-model="f.ai_runs_month" inputmode="numeric" placeholder="blank = unlimited"></label>
      <div class="flags"><label class="chk"><input v-model="f.public" type="checkbox"> Shown publicly</label><label class="chk"><input v-model="f.active" type="checkbox"> Available for new customers</label></div>
      <div class="wide mods">
        <span class="label">Modules included</span>
        <div v-for="[g, ms] in groups" :key="g" class="mg"><b>{{ g }}</b><label v-for="m in ms" :key="m.code" class="chk"><input v-model="f.modules" type="checkbox" :value="m.code"> {{ m.label }}</label></div>
      </div>
      <div class="wide row"><button class="btn" type="submit">Save plan</button><button class="btn secondary" type="button" @click="editing = null">Cancel</button><span v-if="msg" class="error">{{ msg }}</span></div>
    </form>
    <div class="plans">
      <div v-for="p in data.plans" :key="p.code" class="card plan" :class="{ off: !p.active }">
        <div class="ph"><h2>{{ p.name }}</h2><span v-if="!p.public" class="tag">Private</span><span v-if="!p.active" class="tag">Inactive</span></div>
        <p class="price"><b>{{ p.price_monthly ? '$' + Number(p.price_monthly).toLocaleString() : '—' }}</b><span v-if="p.price_monthly">/ month</span></p>
        <p class="muted">{{ p.description }}</p>
        <ul class="lims"><li>{{ lim(p.seat_limit) }} seats</li><li>{{ lim(p.storage_gb, ' GB') }} storage</li><li>{{ lim(p.ai_runs_month) }} AI runs / month</li></ul>
        <p class="mods-l">{{ p.modules.map(label).join(' · ') }}</p>
        <div class="pf"><span>{{ p.customers }} customer{{ p.customers === 1 ? '' : 's' }}</span><button type="button" class="link" @click="edit(p)">Edit</button></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 8px; } .lead { color: var(--c-muted); margin: 0 0 20px; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 20px; } .frm > label { display: flex; flex-direction: column; gap: 6px; } .wide { grid-column: 1 / -1; }
input { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.chk { display: flex !important; flex-direction: row !important; gap: 8px; align-items: center; font-size: 13px; } .chk input { width: auto; }
.flags { display: flex; flex-direction: column; gap: 8px; justify-content: end; }
.mods { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; } .mods > .label { grid-column: 1 / -1; } .mg { display: flex; flex-direction: column; gap: 6px; } .mg b { font-weight: 500; font-size: 13px; color: var(--c-navy); }
.row { display: flex; gap: 10px; align-items: center; }
.plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.plan { display: flex; flex-direction: column; } .plan.off { opacity: .6; }
.ph { display: flex; gap: 8px; align-items: center; } .ph h2 { margin: 0; }
.tag { font-size: 10.5px; color: var(--c-muted); border: 1px solid var(--c-rule-strong); padding: 1px 6px; }
.price { margin: 10px 0 4px; } .price b { font-family: var(--font-heading); font-weight: 500; font-size: 30px; color: var(--c-navy); } .price span { color: var(--c-muted); font-size: 13px; margin-left: 4px; }
.lims { list-style: none; padding: 0; margin: 10px 0; font-size: 13px; } .lims li { padding: 3px 0; }
.mods-l { font-size: 12px; color: var(--c-muted); line-height: 1.6; flex: 1; }
.pf { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--c-rule); padding-top: 10px; font-size: 13px; }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.muted { color: var(--c-muted); font-size: 13px; } .error { color: var(--c-danger); }
@media (max-width: 1000px) { .frm, .mods { grid-template-columns: 1fr; } }
</style>
