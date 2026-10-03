<script setup lang="ts">
useHead({ title: 'Modules' })
interface Mod { code: string; group: string; groupLabel: string; label: string; switchable: boolean; inPlan: boolean; enabled: boolean; roles?: string[] }
const { data, refresh } = await useFetch<Mod[]>('/api/modules')
const groups = computed(() => {
  const g: Record<string, { label: string; items: Mod[] }> = {}
  for (const m of data.value ?? []) (g[m.group] ??= { label: m.groupLabel, items: [] }).items.push(m)
  return Object.values(g)
})
const msg = ref('')
const ROLE: Record<string, string> = { admin: 'Admin', gp: 'GP', team: 'Team', family: 'Family' }
async function toggle(m: Mod) {
  msg.value = ''
  if (m.enabled && !confirm('Switch off ' + m.label + '? Its pages, links and data become unavailable to everyone until switched back on. Nothing is deleted.')) return
  try { await $fetch('/api/admin/modules', { method: 'POST', body: { code: m.code, enabled: !m.enabled } }); await refresh(); await refreshNuxtData() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not change the module.' }
}
</script>

<template>
  <section>
    <p class="label">Administration</p>
    <h1>Modules</h1>
    <p class="lead">Switch whole areas of this workspace on or off. Switching off hides a module from everyone and blocks its pages, links and forms; no data is deleted. Who can use a module is set by role.</p>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div v-for="g in groups" :key="g.label" class="card grp">
      <h2>{{ g.label }}</h2>
      <div v-for="m in g.items" :key="m.code" class="row">
        <div><b>{{ m.label }}</b><span class="sub">For: {{ (m.roles ?? []).map((r) => ROLE[r] ?? r).join(', ') }}{{ (m.roles ?? []).includes('admin') ? '' : ' (and admins)' }}</span></div>
        <span v-if="m.switchable && !m.inPlan" class="sub">Not in your plan</span>
        <button v-else-if="m.switchable" type="button" class="switch" role="switch" :aria-checked="m.enabled" :aria-label="m.label" @click="toggle(m)"><span /></button>
        <span v-else class="sub">Always on</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lead { color: var(--c-muted); margin: 8px 0 24px; max-width: 70ch; }
.grp { margin-bottom: 16px; } .grp h2 { margin-bottom: 8px; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-top: 1px solid var(--c-rule); }
.row b { color: var(--c-navy); font-weight: 500; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.switch { width: 44px; height: 24px; border: 1px solid var(--c-rule-strong); background: #e7e7e4; position: relative; cursor: pointer; padding: 0; }
.switch span { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; background: #fff; border: 1px solid var(--c-rule-strong); transition: left .15s; }
.switch[aria-checked="true"] { background: var(--c-navy); border-color: var(--c-navy); }
.switch[aria-checked="true"] span { left: 22px; border-color: var(--c-navy); }
.switch:focus-visible { outline: 2px solid var(--c-blue); outline-offset: 2px; }
.error { color: var(--c-danger); }
</style>
