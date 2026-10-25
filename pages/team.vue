<script setup lang="ts">
import type { TeamUser } from '~/server/api/admin/users/index.get'
useHead({ title: 'Team' })
const { data: users, error, refresh } = await useFetch<TeamUser[]>('/api/admin/users')
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const { data: me } = await useFetch<{ email: string; roles: string[]; org: { kind: string } | null }>('/api/auth/me')
// GPs run this page too on Aidi OS; only an admin gives or changes the Admin role.
const isAdmin = computed(() => (me.value?.roles ?? []).includes('admin'))
const isCo = computed(() => me.value?.org?.kind === 'company')
const AIDI_ROLES = [
  { v: 'admin', label: 'Admin' }, { v: 'gp', label: 'GP' }, { v: 'team', label: 'Team' }, { v: 'family', label: 'Family' },
  { v: 'adviser', label: 'Adviser' }, { v: 'founder', label: 'Founder' }, { v: 'investor', label: 'Investor' }, { v: 'client', label: 'Client' }, { v: 'wealth_client', label: 'Wealth client' }
]
const CO_ROLES = [{ v: 'admin', label: 'Admin · billing, plan and team' }, { v: 'gp', label: 'Founder · every company feature' }, { v: 'team', label: 'Team member · day-to-day work' }]
const CO_LABEL: Record<string, string> = { admin: 'Admin', gp: 'Founder', team: 'Team member' }
const ROLES = computed(() => (isCo.value ? CO_ROLES : AIDI_ROLES).filter((r) => isAdmin.value || r.v !== 'admin'))
async function removeUser(u: { id: string; email: string }) { if (!await askConfirm('Remove ' + u.email + ' from this workspace? They lose access immediately.')) return; try { await $fetch('/api/admin/users/' + u.id, { method: 'DELETE' }); await refresh() } catch (e) { notify((e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not remove.') } }
const label = (r: string) => (isCo.value ? CO_LABEL[r] ?? r : AIDI_ROLES.find((x) => x.v === r)?.label ?? r)
const form = reactive({ full_name: '', email: '', role: 'team', entity_id: '', include_subsidiaries: false, send_email: true })
const busy = ref(false)
// Aidi OS opens on People, contracts & pay; Access (who can sign in) is the second tab.
const ttab = ref<'access' | 'people'>(useRoute().query.t === 'access' ? 'access' : 'people'); watch(ttab, (t) => useRouter().replace({ query: { t } }))
const msg = ref('')
const ok = ref('')
const adding = reactive<Record<string, { role: string; entity_id: string; subs: boolean }>>({})
function errText(e: unknown) { const d = (e as { data?: { data?: { error?: { message?: string } } } }).data; return d?.data?.error?.message ?? 'Something went wrong. Try again.' }
async function run(fn: () => Promise<unknown>, done?: string) {
  busy.value = true; msg.value = ''; ok.value = ''
  try { await fn(); if (done) ok.value = done; await refresh() } catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
const invite = () => run(async () => {
  const r = await $fetch<{ emailed: boolean }>('/api/admin/users', { method: 'POST', body: { ...form } })
  ok.value = r.emailed ? 'Invitation sent to ' + form.email + '.' : 'Access granted to ' + form.email + '. No email was sent.'
  form.full_name = ''; form.email = ''
})
const setRole = (u: TeamUser, action: 'add' | 'remove' | 'subsidiaries', role: string, entity_id: string | null, include_subsidiaries = false) =>
  run(() => $fetch('/api/admin/users/' + u.id + '/roles', { method: 'POST', body: { action, role, entity_id, include_subsidiaries } }))
// Several companies at once: one role per company picked.
async function addRoles(u: TeamUser) { const a = adding[u.id]; if (!a?.role) return; await setRole(u, 'add', a.role, a.entity_id || null, a.subs); adding[u.id] = { role: '', entity_id: '', subs: false } }
// Edit a member's name (admins).
const nameEd = reactive({ id: '', value: '' })
const saveName = (u: TeamUser) => run(async () => { await $fetch('/api/admin/users/' + u.id + '/name', { method: 'POST', body: { full_name: nameEd.value } }); nameEd.id = '' }, 'Name updated.')
const setStatus = async (u: TeamUser, status: 'active' | 'disabled') => {
  if (status === 'disabled' && !await askConfirm('Disable ' + u.email + '? They are signed out immediately.')) return
  return run(() => $fetch('/api/admin/users/' + u.id + '/status', { method: 'POST', body: { status } }))
}
const when = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never')
</script>

<template>
  <CompanyTeam v-if="isCo" />
  <section v-else>
    <p class="label">Administration</p>
    <h1>Team</h1>
    <p class="lead">{{ isCo ? 'Who can sign in and what they see. Changes are logged.' : 'People, contracts, pay and sign-in access. Changes are logged.' }}</p>

    <nav v-if="!isCo" class="ttabs"><button :class="{ on: ttab === 'people' }" @click="ttab = 'people'">People, contracts &amp; pay</button><button :class="{ on: ttab === 'access' }" @click="ttab = 'access'">Access</button></nav>
    <TeamPeople v-if="!isCo && ttab === 'people'" />
    <template v-else>
    <form class="card invite" @submit.prevent="invite">
      <h2>Invite someone</h2>
      <div class="grid">
        <label class="label">Full name<input v-model="form.full_name" required maxlength="200"></label>
        <label class="label">Email<input v-model="form.email" type="email" required maxlength="254"></label>
        <label class="label">Role<select v-model="form.role"><option v-for="r in ROLES" :key="r.v" :value="r.v">{{ r.label }}</option></select></label>
        <label v-if="!isCo" class="label">Limited to company<select v-model="form.entity_id"><option value="">All (group-wide)</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
        <label v-if="!isCo && form.entity_id" class="chk"><input v-model="form.include_subsidiaries" type="checkbox"> Also its subsidiaries</label>
      </div>
      <label class="check"><input v-model="form.send_email" type="checkbox"> Email them an invitation</label>
      <button class="btn" type="submit" :disabled="busy">Invite</button>
    </form>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="ok" role="status">{{ ok }}</p>

    <p v-if="error" class="error" role="alert">{{ error.statusCode === 403 ? 'Only admins can manage the team.' : 'Could not load the team.' }}</p>
    <table v-else-if="users?.length" class="table">
      <caption class="scopehint">A company role limits access to that company (and its subsidiaries if ticked). Admins and group-wide roles see everything.</caption>
      <thead><tr><th>Person</th><th>Roles</th><th>Last sign-in</th><th>Access</th></tr></thead>
      <tbody>
        <tr v-for="u in users" :key="u.id" :class="{ off: u.status === 'disabled' }">
          <td><form v-if="nameEd.id === u.id" class="nmf" @submit.prevent="saveName(u)"><input v-model="nameEd.value" maxlength="200" required aria-label="Full name"><button class="btn sm" :disabled="busy || !nameEd.value.trim()">Save</button><button type="button" class="lk" @click="nameEd.id = ''">Cancel</button></form>
            <b v-else>{{ u.full_name }} <button type="button" class="lk nme" title="Edit name" @click="nameEd.id = u.id; nameEd.value = u.full_name">Edit</button></b><span class="sub">{{ u.email }}<template v-if="u.email === me?.email"> · you</template></span></td>
          <td>
            <span v-for="r in u.roles" :key="r.role + (r.entity_id ?? '')" class="chip">
              {{ label(r.role) }}<template v-if="r.entity_name"> · {{ r.entity_name }} <button type="button" class="subs" :class="{ on: r.subsidiaries }" :title="r.subsidiaries ? 'Includes subsidiaries. Click to limit.' : 'This company only. Click to add subsidiaries.'" :disabled="busy" @click="setRole(u, 'subsidiaries', r.role, r.entity_id, !r.subsidiaries)">{{ r.subsidiaries ? '+ subsidiaries' : 'only' }}</button></template>
              <button type="button" :aria-label="'Remove ' + label(r.role)" :disabled="busy" @click="setRole(u, 'remove', r.role, r.entity_id)">×</button>
            </span>
            <span class="add">
              <select v-model="(adding[u.id] ??= { role: '', entity_id: '', subs: false }).role" :aria-label="'Add a role for ' + u.email">
                <option value="">+ Add role</option><option v-for="r in ROLES" :key="r.v" :value="r.v">{{ r.label }}</option>
              </select>
              <template v-if="adding[u.id]?.role">
                <select v-model="adding[u.id]!.entity_id" aria-label="Limit to company"><option value="">All companies</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select>
                <label v-if="adding[u.id]!.entity_id" class="chk sm"><input v-model="adding[u.id]!.subs" type="checkbox"> + subsidiaries</label>
                <button type="button" class="btn sm" :disabled="busy" @click="addRoles(u)">Add</button>
              </template>
            </span>
          </td>
          <td class="muted">{{ when(u.last_login_at) }}</td>
          <td>
            <button v-if="u.status === 'active'" type="button" class="btn secondary sm" :disabled="busy || u.email === me?.email" @click="setStatus(u, 'disabled')">Disable</button><button v-if="u.email !== me?.email" type="button" class="btn secondary sm danger" :disabled="busy" @click="removeUser(u)">Remove</button>
            <button v-else type="button" class="btn sm" :disabled="busy" @click="setStatus(u, 'active')">Re-enable</button>
          </td>
        </tr>
      </tbody>
    </table>
    </template>
  </section>
</template>

<style scoped>
.lead { color: var(--c-muted); margin: 8px 0 24px; }
.invite { margin-bottom: 16px; }
.invite h2 { margin-bottom: 14px; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 12px; }
.grid label { display: flex; flex-direction: column; gap: 6px; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 9px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.check { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; background: #fff; border: 1px solid var(--c-rule); border-radius: var(--radius); margin-top: 16px; }
th { text-align: left; font-size: var(--type-label); letter-spacing: 0; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 14px 16px; border-bottom: 1px solid var(--c-rule); vertical-align: top; }
tr.off td { opacity: .55; }
b { color: var(--c-navy); font-weight: 500; }
.sub { display: block; color: var(--c-muted); font-size: 12px; }
.chip { display: inline-flex; align-items: center; gap: 4px; background: var(--c-paper-2); border: 1px solid var(--c-rule); border-radius: var(--radius); padding: 3px 4px 3px 10px; margin: 0 6px 6px 0; font-size: 13px; }
.chip button { background: none; border: 0; cursor: pointer; color: var(--c-muted); font-size: 15px; line-height: 1; padding: 0 4px; }
.add { display: inline-flex; gap: 6px; align-items: center; }
.add select { padding: 4px 6px; font-size: 13px; }
.btn.sm { padding: 5px 10px; font-size: 13px; }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr 1fr; } } @media (max-width: 600px) { .grid { grid-template-columns: minmax(0, 1fr); } .grid input, .grid select { min-width: 0; width: 100%; } }
.danger { color: var(--c-danger); margin-left: 6px; }
.scopehint { caption-side: top; text-align: left; font-size: 12.5px; color: var(--c-muted); padding: 0 0 10px; }
.subs { background: none; border: 1px solid var(--c-rule-strong); font: inherit; font-size: 11px; padding: 0 5px; margin-left: 4px; cursor: pointer; color: var(--c-muted); } .subs.on { border-color: var(--c-navy); color: var(--c-navy); }
.chk { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; } .chk input { width: auto; } .chk.sm { font-size: 12px; }
.nmf { display: flex; gap: 6px; align-items: center; margin-bottom: 2px; } .nmf input { font: inherit; font-size: 13.5px; padding: 5px 8px; border: 1px solid var(--c-rule-strong); min-width: 0; width: 180px; } .nme { font-size: 12px; font-weight: 400; margin-left: 4px; opacity: .7; } .nme:hover { opacity: 1; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk:hover { text-decoration: underline; }
.ttabs { display: flex; gap: 24px; border-bottom: 1px solid var(--c-rule); margin: 4px 0 18px; } .ttabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 0; font: inherit; font-size: 14px; color: var(--c-muted); cursor: pointer; margin-bottom: -1px; } .ttabs button.on { color: var(--c-ink); border-bottom-color: var(--c-navy); font-weight: 500; }
</style>
