<script setup lang="ts">
// Finvry team: who can sign in, their role, and what each person can open. Admins open everything; for anyone else an
// admin can switch features off one by one (hidden from their menu and blocked on the server). Changes are logged.
import type { TeamUser } from '~/server/api/admin/users/index.get'
const { data: users, refresh } = await useFetch<TeamUser[]>('/api/admin/users')
const { data: me } = await useFetch<{ email: string; roles: string[]; org: { kind: string; name?: string } | null }>('/api/auth/me', { key: 'me' })
const isAdmin = computed(() => (me.value?.roles ?? []).includes('admin'))
interface Acc { features: { key: string; label: string; group: string }[]; members: Record<string, { admin: boolean; allowed: string[]; off: string[] }> }
const { data: acc, refresh: refreshAcc } = await useFetch<Acc>('/api/admin/member-access', { default: () => ({ features: [], members: {} }), server: false, immediate: isAdmin.value })
const ROLE: Record<string, string> = { admin: 'Admin', gp: 'Founder', team: 'Team member' }
const ROLE_NOTE: Record<string, string> = { admin: 'Everything, billing and team', gp: 'Every company feature', team: 'Day-to-day work' }
const roleOf = (u: TeamUser) => (['admin', 'gp', 'team'].find((r) => u.roles.some((x) => x.role === r)) ?? u.roles[0]?.role ?? 'team')
const initials = (u: TeamUser) => ((u.full_name || u.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join(''))
const when = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const access = (u: TeamUser) => { const a = acc.value?.members[u.id]; if (!a || a.admin || roleOf(u) === 'admin') return { all: true, text: 'Everything' }; const n = a.allowed.length - a.off.length; return n >= a.allowed.length ? { all: true, text: 'Everything' } : { all: false, text: n + ' of ' + a.allowed.length } }
// Members, people invited who have not signed in yet, and disabled accounts.
const view = ref<'members' | 'invited' | 'disabled'>('members')
const groups = computed(() => { const u = users.value ?? []; return { members: u.filter((x) => x.status !== 'disabled' && (x.last_login_at || x.email === me.value?.email)), invited: u.filter((x) => x.status !== 'disabled' && !x.last_login_at && x.email !== me.value?.email), disabled: u.filter((x) => x.status === 'disabled') } })
const shown = computed(() => groups.value[view.value])
const msg = ref(''), ok = ref(''), busy = ref(false)
watch(ok, (v) => { if (v) setTimeout(() => { if (ok.value === v) ok.value = '' }, 5000) })
const errText = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong. Try again.'
// Invite.
const inv = reactive({ open: false, full_name: '', email: '', role: 'team', send_email: true })
async function invite() {
  busy.value = true; msg.value = ''
  try { const r = await $fetch<{ emailed: boolean }>('/api/admin/users', { method: 'POST', body: { full_name: inv.full_name, email: inv.email, role: inv.role, entity_id: '', include_subsidiaries: false, send_email: inv.send_email } }); ok.value = r.emailed ? 'Invitation sent to ' + inv.email + '.' : inv.email + ' can now sign in.'; inv.open = false; inv.full_name = ''; inv.email = ''; await Promise.all([refresh(), refreshAcc()]) }
  catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
// The person panel: name, role, and the features they can open.
const sel = ref<TeamUser | null>(null)
const ed = reactive({ name: '', role: 'team', off: [] as string[] })
function open(u: TeamUser) { if (!isAdmin.value) return; sel.value = u; ed.name = u.full_name; ed.role = roleOf(u); ed.off = [...(acc.value?.members[u.id]?.off ?? [])]; msg.value = '' }
const allowedSel = computed(() => (sel.value ? acc.value?.members[sel.value.id]?.allowed ?? [] : []))
const featureGroups = computed(() => { const g: { label: string; items: Acc['features'] }[] = []; for (const f of acc.value?.features ?? []) { let x = g.find((y) => y.label === f.group); if (!x) g.push(x = { label: f.group, items: [] }); x.items.push(f) } return g })
const toggle = (k: string) => { const i = ed.off.indexOf(k); if (i >= 0) ed.off.splice(i, 1); else ed.off.push(k) }
const isSelf = computed(() => !!sel.value && sel.value.email === me.value?.email)
async function save() {
  const u = sel.value; if (!u) return
  busy.value = true; msg.value = ''
  try {
    if (ed.name.trim() && ed.name.trim() !== u.full_name) await $fetch('/api/admin/users/' + u.id + '/name', { method: 'POST', body: { full_name: ed.name.trim() } })
    const was = roleOf(u)
    if (ed.role !== was && !isSelf.value) { await $fetch('/api/admin/users/' + u.id + '/roles', { method: 'POST', body: { action: 'add', role: ed.role, entity_id: null } }); await $fetch('/api/admin/users/' + u.id + '/roles', { method: 'POST', body: { action: 'remove', role: was, entity_id: null } }) }
    if (ed.role !== 'admin') await $fetch('/api/admin/member-access', { method: 'POST', body: { user_id: u.id, off: ed.off.filter((k) => allowedSel.value.includes(k)) } })
    ok.value = 'Saved.'; sel.value = null; await Promise.all([refresh(), refreshAcc()])
  } catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
async function setStatus(status: 'active' | 'disabled') {
  const u = sel.value; if (!u) return
  if (status === 'disabled' && !await askConfirm('Disable ' + u.email + '? They are signed out immediately.')) return
  busy.value = true; try { await $fetch('/api/admin/users/' + u.id + '/status', { method: 'POST', body: { status } }); sel.value = null; await refresh() } catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
async function remove() {
  const u = sel.value; if (!u || !await askConfirm('Remove ' + u.email + ' from this workspace? They lose access immediately.')) return
  busy.value = true; try { await $fetch('/api/admin/users/' + u.id, { method: 'DELETE' }); sel.value = null; await refresh() } catch (e) { msg.value = errText(e) } finally { busy.value = false }
}
</script>

<template>
  <section class="tm">
    <div class="top">
      <div><div class="eyb">{{ me?.org?.name ?? 'Your company' }}</div><h1>Team</h1></div>
      <button v-if="isAdmin" type="button" class="bt p" @click="inv.open = true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>Invite</button>
    </div>
    <transition name="toast"><p v-if="ok" class="toast" role="status">{{ ok }}</p></transition>
    <p v-if="msg && !sel && !inv.open" class="error">{{ msg }}</p>
    <div class="panel">
      <div class="ph"><div class="seg"><button v-for="[k, l] in ([['members', 'Members'], ['invited', 'Invited'], ['disabled', 'Disabled']] as const)" v-show="k === 'members' || groups[k].length" :key="k" type="button" :class="{ on: view === k }" @click="view = k">{{ l }}<em>{{ groups[k].length }}</em></button></div></div>
      <table data-nosearch v-if="shown.length"><thead><tr><th>Person</th><th>Role</th><th v-if="isAdmin">Can open</th><th>Last active</th><th /></tr></thead>
        <tbody><tr v-for="u in shown" :key="u.id" :class="{ click: isAdmin, on: sel?.id === u.id }" @click="open(u)">
          <td><div class="who"><span class="av" :class="{ l: roleOf(u) !== 'admin' }">{{ initials(u) }}</span><div><b>{{ u.full_name || u.email }}</b><span>{{ u.email }}</span></div></div></td>
          <td><span class="tag">{{ ROLE[roleOf(u)] ?? roleOf(u) }}</span></td>
          <td v-if="isAdmin" class="nw"><span v-if="access(u).all" class="mut">Everything</span><template v-else><i class="dot" />{{ access(u).text }}</template></td>
          <td class="mut nw">{{ view === 'invited' ? 'Invited ' + when(u.created_at) : when(u.last_login_at) }}</td>
          <td class="r mut">{{ isAdmin ? '›' : '' }}</td></tr></tbody></table>
      <p v-else class="none">No one here yet</p>
    </div>

    <transition name="sheet"><div v-if="sel" class="scrim" @click.self="sel = null">
      <aside class="sheet" role="dialog" :aria-label="sel.full_name || sel.email">
        <div class="sh"><input v-model="ed.name" class="nm" maxlength="200" aria-label="Name"><p>{{ sel.email }}</p><button type="button" class="x" aria-label="Close" @click="sel = null">×</button></div>
        <div class="roles"><button v-for="r in (['admin', 'gp', 'team'] as const)" :key="r" type="button" class="rc" :class="{ on: ed.role === r }" :disabled="isSelf" @click="ed.role = r"><b>{{ ROLE[r] }}</b><span>{{ ROLE_NOTE[r] }}</span></button></div>
        <div v-if="ed.role === 'admin'" class="perm"><p class="mut">Admins open everything, including billing and the team.</p></div>
        <div v-else class="perm">
          <p class="pl">Can open</p>
          <template v-for="g in featureGroups" :key="g.label"><div class="pg">{{ g.label }}</div>
            <div class="pi"><button v-for="f in g.items" :key="f.key" type="button" class="pc" :class="{ off: ed.off.includes(f.key) || !allowedSel.includes(f.key) }" :disabled="!allowedSel.includes(f.key)" :title="allowedSel.includes(f.key) ? '' : 'Not part of this role'" @click="toggle(f.key)"><span class="cb" :class="{ on: allowedSel.includes(f.key) && !ed.off.includes(f.key) }" />{{ f.label }}</button></div></template>
          <p class="mut ft">Billing, plan and team stay with admins.</p>
        </div>
        <p v-if="msg" class="error pad">{{ msg }}</p>
        <div class="sf"><div class="lft"><template v-if="!isSelf"><button v-if="sel.status === 'disabled'" type="button" class="lk" :disabled="busy" @click="setStatus('active')">Re-enable</button><button v-else type="button" class="lk" :disabled="busy" @click="setStatus('disabled')">Disable</button><button type="button" class="lk red" :disabled="busy" @click="remove">Remove</button></template></div>
          <button type="button" class="bt p" :disabled="busy" @click="save">{{ busy ? 'Saving…' : 'Save' }}</button></div>
      </aside>
    </div></transition>

    <AppModal :open="inv.open" title="Invite someone" @close="inv.open = false">
      <form id="invf" class="inv" @submit.prevent="invite">
        <label class="label">Full name<input v-model="inv.full_name" required maxlength="200"></label>
        <label class="label">Email<input v-model="inv.email" type="email" required maxlength="254"></label>
        <div class="roles in"><button v-for="r in (['admin', 'gp', 'team'] as const)" :key="r" type="button" class="rc" :class="{ on: inv.role === r }" @click="inv.role = r"><b>{{ ROLE[r] }}</b><span>{{ ROLE_NOTE[r] }}</span></button></div>
        <label class="chk"><input v-model="inv.send_email" type="checkbox"> Email them an invitation</label>
        <p v-if="msg" class="error">{{ msg }}</p>
      </form>
      <template #foot><button class="btn secondary" type="button" @click="inv.open = false">Cancel</button><button class="btn" type="submit" form="invf" :disabled="busy">{{ busy ? 'Inviting…' : 'Invite' }}</button></template>
    </AppModal>
  </section>
</template>

<style scoped>
.tm { display: flex; flex-direction: column; gap: 18px; max-width: 1100px; }
.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; } .eyb { font-size: 13px; color: var(--c-muted); margin-bottom: 6px; } h1 { margin: 0; }
.bt { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; font: inherit; font-size: 13.5px; background: #fff; border: 1px solid var(--c-rule-strong); color: var(--c-ink); cursor: pointer; } .bt.p { background: var(--c-navy); color: #fff; border-color: var(--c-navy); } .bt svg { width: 15px; height: 15px; } .bt:disabled { opacity: .6; cursor: default; }
.panel { background: #fff; border: 1px solid var(--c-rule); }
.ph { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; }
.seg { display: inline-flex; gap: 4px; } .seg button { background: none; border: 0; padding: 5px 11px; font: inherit; font-size: 13px; color: var(--c-ink-soft); cursor: pointer; } .seg button.on { background: var(--c-paper-2); color: var(--c-ink); font-weight: 500; } .seg em { font-style: normal; color: var(--c-muted); margin-left: 5px; font-size: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; font-weight: 500; font-size: 12.5px; color: var(--c-muted); padding: 10px 20px; border-top: 1px solid var(--c-rule); } td { padding: 12px 20px; border-top: 1px solid var(--c-rule); vertical-align: middle; }
tr.click { cursor: pointer; } tr.click:hover td, tr.on td { background: #fafafa; }
.who { display: flex; align-items: center; gap: 12px; } .who b { font-weight: 500; display: block; color: var(--c-ink); } .who span { font-size: 12.5px; color: var(--c-muted); }
.av { width: 32px; height: 32px; background: var(--c-navy); color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 600; flex: none; } .av.l { background: #dfe7f0; color: var(--c-navy); }
.tag { font-size: 12.5px; color: var(--c-ink-soft); background: var(--c-paper-2); padding: 3px 9px; white-space: nowrap; }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #5fa8d3; margin-right: 6px; vertical-align: 1px; }
.r { text-align: right; } .mut { color: var(--c-muted); } .nw { white-space: nowrap; } .none { padding: 18px 20px; border-top: 1px solid var(--c-rule); color: var(--c-muted); font-size: 13px; margin: 0; text-align: center; }
.scrim { position: fixed; inset: 0; background: rgba(12, 26, 46, .18); z-index: 1000; display: flex; justify-content: flex-end; }
.sheet { width: min(440px, 100%); height: 100%; background: #fff; display: flex; flex-direction: column; overflow-y: auto; box-shadow: -18px 0 50px rgba(12, 26, 46, .14); }
.sh { padding: 22px 22px 6px; position: relative; } .nm { font: inherit; font-size: 18px; font-weight: 600; border: 1px solid transparent; padding: 2px 4px; margin-left: -5px; width: calc(100% - 30px); color: var(--c-ink); } .nm:hover, .nm:focus { border-color: var(--c-rule-strong); outline: none; } .sh p { margin: 2px 0 0; color: var(--c-muted); font-size: 13px; }
.x { position: absolute; top: 18px; right: 16px; background: none; border: 0; font-size: 22px; color: var(--c-muted); cursor: pointer; }
.roles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 14px 22px; } .roles.in { padding: 0; }
.rc { text-align: left; border: 1px solid var(--c-rule-strong); background: #fff; padding: 10px 12px; font: inherit; cursor: pointer; } .rc b { display: block; font-weight: 500; font-size: 13.5px; color: var(--c-ink); } .rc span { color: var(--c-muted); font-size: 11.5px; } .rc.on { border-color: var(--c-navy); box-shadow: inset 0 0 0 1px var(--c-navy); } .rc:disabled { cursor: default; opacity: .7; }
.perm { padding: 4px 22px 10px; flex: 1; } .pl { margin: 6px 0 0; font-size: 13px; font-weight: 600; } .pg { font-size: 12px; color: var(--c-muted); margin: 14px 0 4px; } .pi { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.pc { display: flex; align-items: center; gap: 10px; padding: 7px 0; font: inherit; font-size: 13.5px; background: none; border: 0; cursor: pointer; text-align: left; color: var(--c-ink); } .pc.off { color: var(--c-muted); } .pc:disabled { cursor: default; opacity: .5; }
.cb { width: 16px; height: 16px; border: 1.5px solid var(--c-rule-strong); display: grid; place-items: center; flex: none; } .cb.on { background: var(--c-navy); border-color: var(--c-navy); } .cb.on::after { content: ''; width: 7px; height: 4px; border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(-45deg) translate(1px, -1px); }
.ft { margin: 16px 0 0; font-size: 12.5px; }
.sf { display: flex; justify-content: space-between; align-items: center; padding: 14px 22px; border-top: 1px solid var(--c-rule); position: sticky; bottom: 0; background: #fff; } .lft { display: flex; gap: 14px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--c-blue-deep); cursor: pointer; } .lk.red { color: var(--c-danger); }
.inv { display: flex; flex-direction: column; gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; } input { font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--c-rule-strong); } .chk { display: flex; gap: 8px; align-items: center; font-size: 13.5px; } .chk input { width: auto; }
.error { color: var(--c-danger); font-size: 13px; margin: 0; } .pad { padding: 0 22px 10px; }
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--c-navy); color: #fff; padding: 10px 16px; font-size: 13.5px; z-index: 1010; margin: 0; }
.toast-enter-active, .toast-leave-active, .sheet-enter-active, .sheet-leave-active { transition: opacity .18s; } .toast-enter-from, .toast-leave-to, .sheet-enter-from, .sheet-leave-to { opacity: 0; }
@media (max-width: 760px) { th:nth-child(4), td:nth-child(4) { display: none; } .roles { grid-template-columns: 1fr; } .pi { grid-template-columns: 1fr; } }
</style>
