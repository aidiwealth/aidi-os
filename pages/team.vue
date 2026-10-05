<script setup lang="ts">
import type { TeamUser } from '~/server/api/admin/users/index.get'
useHead({ title: 'Team' })
const { data: users, error, refresh } = await useFetch<TeamUser[]>('/api/admin/users')
const { data: entities } = await useFetch<{ id: string; name: string }[]>('/api/entities')
const { data: me } = await useFetch<{ email: string; org: { kind: string } | null }>('/api/auth/me')
const isCo = computed(() => me.value?.org?.kind === 'company')
const AIDI_ROLES = [
  { v: 'admin', label: 'Admin' }, { v: 'gp', label: 'GP' }, { v: 'team', label: 'Team' }, { v: 'family', label: 'Family' },
  { v: 'adviser', label: 'Adviser' }, { v: 'founder', label: 'Founder' }, { v: 'investor', label: 'Investor' }, { v: 'client', label: 'Client' }
]
const CO_ROLES = [{ v: 'admin', label: 'Admin · billing, plan and team' }, { v: 'gp', label: 'Founder · every company feature' }, { v: 'team', label: 'Team member · day-to-day work' }]
const CO_LABEL: Record<string, string> = { admin: 'Admin', gp: 'Founder', team: 'Team member' }
const ROLES = computed(() => (isCo.value ? CO_ROLES : AIDI_ROLES))
const label = (r: string) => (isCo.value ? CO_LABEL[r] ?? r : AIDI_ROLES.find((x) => x.v === r)?.label ?? r)
const form = reactive({ full_name: '', email: '', role: 'team', entity_id: '', send_email: true })
const busy = ref(false)
const msg = ref('')
const ok = ref('')
const adding = reactive<Record<string, { role: string; entity_id: string }>>({})
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
const setRole = (u: TeamUser, action: 'add' | 'remove', role: string, entity_id: string | null) =>
  run(() => $fetch('/api/admin/users/' + u.id + '/roles', { method: 'POST', body: { action, role, entity_id } }))
const setStatus = (u: TeamUser, status: 'active' | 'disabled') => {
  if (status === 'disabled' && !confirm('Disable ' + u.email + '? They are signed out immediately.')) return
  return run(() => $fetch('/api/admin/users/' + u.id + '/status', { method: 'POST', body: { status } }))
}
const when = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never')
</script>

<template>
  <section>
    <p class="label">Administration</p>
    <h1>Team</h1>
    <p class="lead">Who can sign in to this workspace, and what they can see. Changes take effect immediately and are logged.</p>

    <form class="card invite" @submit.prevent="invite">
      <h2>Invite someone</h2>
      <div class="grid">
        <label class="label">Full name<input v-model="form.full_name" required maxlength="200"></label>
        <label class="label">Email<input v-model="form.email" type="email" required maxlength="254"></label>
        <label class="label">Role<select v-model="form.role"><option v-for="r in ROLES" :key="r.v" :value="r.v">{{ r.label }}</option></select></label>
        <label v-if="!isCo" class="label">Limited to entity<select v-model="form.entity_id"><option value="">All (group-wide)</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      </div>
      <label class="check"><input v-model="form.send_email" type="checkbox"> Email them an invitation</label>
      <button class="btn" type="submit" :disabled="busy">Invite</button>
    </form>
    <p v-if="msg" class="error" role="alert">{{ msg }}</p><p v-if="ok" class="ok" role="status">{{ ok }}</p>

    <p v-if="error" class="error" role="alert">{{ error.statusCode === 403 ? 'Only admins can manage the team.' : 'Could not load the team.' }}</p>
    <table v-else-if="users?.length" class="table">
      <thead><tr><th>Person</th><th>Roles</th><th>Last sign-in</th><th>Access</th></tr></thead>
      <tbody>
        <tr v-for="u in users" :key="u.id" :class="{ off: u.status === 'disabled' }">
          <td><b>{{ u.full_name }}</b><span class="sub">{{ u.email }}<template v-if="u.email === me?.email"> · you</template></span></td>
          <td>
            <span v-for="r in u.roles" :key="r.role + (r.entity_id ?? '')" class="chip">
              {{ label(r.role) }}<template v-if="r.entity_name"> · {{ r.entity_name }}</template>
              <button type="button" :aria-label="'Remove ' + label(r.role)" :disabled="busy" @click="setRole(u, 'remove', r.role, r.entity_id)">×</button>
            </span>
            <span class="add">
              <select v-model="(adding[u.id] ??= { role: '', entity_id: '' }).role" :aria-label="'Add a role for ' + u.email">
                <option value="">+ Add role</option><option v-for="r in ROLES" :key="r.v" :value="r.v">{{ r.label }}</option>
              </select>
              <template v-if="adding[u.id]?.role">
                <select v-model="adding[u.id]!.entity_id" aria-label="Limit to entity"><option value="">All</option><option v-for="e in entities ?? []" :key="e.id" :value="e.id">{{ e.name }}</option></select>
                <button type="button" class="btn sm" :disabled="busy" @click="setRole(u, 'add', adding[u.id]!.role, adding[u.id]!.entity_id || null); adding[u.id] = { role: '', entity_id: '' }">Add</button>
              </template>
            </span>
          </td>
          <td class="muted">{{ when(u.last_login_at) }}</td>
          <td>
            <button v-if="u.status === 'active'" type="button" class="btn secondary sm" :disabled="busy || u.email === me?.email" @click="setStatus(u, 'disabled')">Disable</button>
            <button v-else type="button" class="btn sm" :disabled="busy" @click="setStatus(u, 'active')">Re-enable</button>
          </td>
        </tr>
      </tbody>
    </table>
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
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr 1fr; } }
</style>
