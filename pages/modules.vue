<script setup lang="ts">
useHead({ title: 'Modules' })
interface Mod { code: string; group: string; groupLabel: string; label: string; switchable: boolean; inPlan: boolean; enabled: boolean; roles?: string[]; defaultRoles?: string[]; custom?: boolean }
const { data, refresh } = await useFetch<Mod[]>('/api/modules')
const groups = computed(() => {
  const g: Record<string, { label: string; items: Mod[] }> = {}
  for (const m of data.value ?? []) (g[m.group] ??= { label: m.groupLabel, items: [] }).items.push(m)
  return Object.values(g)
})
const msg = ref('')
const ROLE: Record<string, string> = { admin: 'Admin', gp: 'GP / founder', team: 'Team', family: 'Family', adviser: 'Adviser', services: 'Services desk' }
const { data: meM } = await useFetch<{ org: { kind: string } | null; platform?: boolean }>('/api/auth/me', { key: 'me' })
const PICK = computed(() => (meM.value?.org?.kind === 'company' ? ['gp', 'team'] : ['gp', 'team', 'family', 'adviser', 'services']))
async function setRoles(m: Mod, role: string, on: boolean) { const cur = new Set(m.roles ?? []); cur.delete('admin'); if (on) cur.add(role); else cur.delete(role); msg.value = ''; try { await $fetch('/api/admin/module-roles', { method: 'POST', body: { code: m.code, roles: [...cur] } }); await refresh(); await refreshNuxtData() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
async function resetRoles(m: Mod) { await $fetch('/api/admin/module-roles', { method: 'POST', body: { code: m.code, roles: [] } }); await refresh(); await refreshNuxtData() }
const { data: con, refresh: refreshCon } = await useFetch<{ rows: { id: string; name: string; email: string; console: string | null }[]; canEdit: boolean; me: string }>('/api/platform/staff/members', { key: 'console-members', default: () => ({ rows: [], canEdit: false, me: '' }), server: false })
async function setConsole(id: string, role: string) { msg.value = ''; try { await $fetch('/api/platform/staff', { method: 'POST', body: { user_id: id, role: role || null } }); await refreshCon() } catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' } }
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
    <p class="lead">Switch whole areas of this workspace on or off. Switching off hides a module from everyone and blocks its pages, links and forms; no data is deleted. Tick which roles can use each module; admins always can.</p>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    <div v-for="g in groups" :key="g.label" class="card grp">
      <h2>{{ g.label }}</h2>
      <div v-for="m in g.items" :key="m.code" class="row">
        <div><b>{{ m.label }}</b><span class="rp"><span class="sub">Who can use it:</span><label v-for="r in PICK" :key="r" class="rc"><input type="checkbox" :checked="(m.roles ?? []).includes(r)" @change="setRoles(m, r, ($event.target as HTMLInputElement).checked)"> {{ ROLE[r] }}</label><span class="sub">+ admins</span><button v-if="m.custom" type="button" class="lk" @click="resetRoles(m)">Reset to default</button></span></div>
        <span v-if="m.switchable && !m.inPlan" class="sub">Not in your plan</span>
        <button v-else-if="m.switchable" type="button" class="switch" role="switch" :aria-checked="m.enabled" :aria-label="m.label" @click="toggle(m)"><span /></button>
        <span v-else class="sub">Always on</span>
      </div>
    </div>
    <div v-if="con?.rows.length" class="card grp"><h2>Finvry console access</h2><p class="sub">Who can open the Finvry console (customers, billing, services desk admin). Owners can change this; sales and support can view customers, support cannot change them.</p>
      <div v-for="u in con.rows" :key="u.id" class="row"><div><b>{{ u.name }}</b><span class="sub">{{ u.email }}</span></div>
        <select :value="u.console ?? ''" :disabled="!con.canEdit || u.id === con.me" @change="setConsole(u.id, ($event.target as HTMLSelectElement).value)"><option value="">No access</option><option value="owner">Owner</option><option value="sales">Sales</option><option value="support">Support</option></select></div></div>
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
.rp { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; margin-top: 4px; } .rc { display: inline-flex; gap: 4px; align-items: center; font-size: 12.5px; } .rc input { width: auto; } .lk { background: none; border: 0; color: var(--c-blue-deep); cursor: pointer; font: inherit; font-size: 12px; padding: 0; } select { font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--c-rule-strong); background: #fff; }
</style>
