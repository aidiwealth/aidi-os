<script setup lang="ts">
// Investor page settings: keep the data room and the cap table for invited investors only. Add people by email (or a
// whole firm as @fund.com), approve or decline requests, and take people off the list (their access ends at once).
interface Inv { id: string; email: string; status: string; name: string | null; company: string | null; note: string | null; invited_at: string | null; requested_at: string | null; last_seen_at: string | null; views: number }
const props = defineProps<{ inviteOnly: string[]; invites: Inv[]; room: boolean; captable: boolean; published: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const busy = ref(false), msg = ref(''), ok = ref(''), add = ref(''), send = ref(true)
const parts = ref<string[]>([]); watchEffect(() => { parts.value = [...props.inviteOnly] })
const requests = computed(() => props.invites.filter((x) => x.status === 'requested'))
const invited = computed(() => props.invites.filter((x) => x.status === 'invited'))
const errOf = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
async function call(body: Record<string, unknown>, done = '') { busy.value = true; msg.value = ''; ok.value = ''; try { await $fetch('/api/investor-page/invites', { method: 'POST', body }); ok.value = done; emit('changed') } catch (e) { msg.value = errOf(e) } finally { busy.value = false } }
function toggle(part: string, on: boolean) { const next = on ? [...new Set([...parts.value, part])] : parts.value.filter((x) => x !== part); parts.value = next; call({ action: 'parts', invite_only: next }, on ? 'Only people you invite can open it now.' : 'Open to anyone with the link again.') }
async function addPeople() { const emails = add.value.split(/[\s,;]+/).filter(Boolean); if (!emails.length) return; await call({ action: 'add', emails, send: send.value }, emails.length + (emails.length === 1 ? ' person' : ' people') + ' added' + (send.value && props.published ? ', invite sent.' : '.')); if (!msg.value) add.value = '' }
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const seen = (x: Inv) => (x.email.startsWith('@') ? 'Everyone at ' + x.email.slice(1) : x.last_seen_at ? 'Opened ' + x.views + (x.views === 1 ? ' time' : ' times') + ' · last ' + day(x.last_seen_at) : 'Not opened yet')
async function remove(x: Inv) { if (await askConfirm('Take ' + x.email + ' off the list? They lose access straight away.')) call({ action: 'remove', id: x.id }, 'Removed.') }
</script>

<template>
  <div id="access" class="card pi">
    <div class="pih"><div><b>Private parts of the page</b><p class="muted">Keep these for investors you invite. They confirm their email with a one-time code, and stay signed in for 30 days on that device. Your team always sees everything.</p></div></div>
    <div class="parts">
      <label class="chk" :class="{ off: !room }"><input type="checkbox" :checked="parts.includes('room')" :disabled="busy || !room" @change="toggle('room', ($event.target as HTMLInputElement).checked)"><span><b>Data room</b><em>{{ room ? 'Folder and file names stay hidden too.' : 'Turn on the data room button first.' }}</em></span></label>
      <label class="chk" :class="{ off: !captable }"><input type="checkbox" :checked="parts.includes('captable')" :disabled="busy || !captable" @change="toggle('captable', ($event.target as HTMLInputElement).checked)"><span><b>Cap table</b><em>{{ captable ? 'Visitors see that it exists, not what\'s in it.' : 'Choose a cap table to show first.' }}</em></span></label>
    </div>
    <p v-if="ok" class="ok">{{ ok }}</p><p v-if="msg" class="error">{{ msg }}</p>
    <template v-if="parts.length || invites.length">
      <div v-if="requests.length" class="blk"><p class="sh">Asking for access <em>{{ requests.length }}</em></p>
        <div v-for="x in requests" :key="x.id" class="ir rq"><span class="who"><b>{{ x.name || x.email }}</b><em>{{ x.name ? x.email : '' }}{{ x.company ? (x.name ? ' · ' : '') + x.company : '' }} · {{ day(x.requested_at) }}</em><q v-if="x.note">{{ x.note }}</q></span>
          <span class="act"><button class="btn" :disabled="busy" @click="call({ action: 'approve', id: x.id }, x.email + ' can open it now' + (published ? ', and has been emailed.' : '.'))">Approve</button><button class="btn secondary" :disabled="busy" @click="call({ action: 'decline', id: x.id }, 'Declined. They aren\'t told.')">Decline</button></span></div></div>
      <div class="blk"><p class="sh">Invite people</p>
        <form class="add" @submit.prevent="addPeople"><input v-model="add" placeholder="name@fund.com, another@vc.com, or @fund.com for a whole firm" maxlength="4000"><button class="btn" :disabled="busy || !add.trim()">Add</button></form>
        <label class="chk sm"><input v-model="send" type="checkbox"> Email them an invite with the page link{{ published ? '' : ' (once the page is published)' }}</label></div>
      <div class="blk"><p class="sh">Can see it <em>{{ invited.length }}</em></p>
        <p v-if="!invited.length" class="muted">No one yet. Add emails above; visitors not on the list can ask for access.</p>
        <div v-for="x in invited" :key="x.id" class="ir"><span class="who"><b>{{ x.name || x.email }}</b><em>{{ x.name ? x.email + ' · ' : '' }}{{ seen(x) }}</em></span>
          <MoreMenu dots :label="'Actions for ' + x.email"><button v-if="!x.email.startsWith('@')" :disabled="!published" @click="call({ action: 'resend', id: x.id }, 'Invite sent again.')">Send the invite again</button><hr v-if="!x.email.startsWith('@')"><button class="red" @click="remove(x)">Take off the list</button></MoreMenu></div></div>
    </template>
  </div>
</template>

<style scoped>
.pi { display: flex; flex-direction: column; gap: 14px; margin-top: 14px; } .pih b { font-size: 15px; } .muted { color: var(--c-muted); font-size: 13px; margin: 4px 0 0; max-width: 760px; } .ok { color: var(--c-ok); margin: 0; } .error { color: var(--c-danger); margin: 0; }
.parts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .parts .chk { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--c-rule); cursor: pointer; } .parts .chk input { margin-top: 3px; width: auto; } .parts .chk span { display: flex; flex-direction: column; gap: 2px; } .parts .chk em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .parts .chk.off { opacity: .6; cursor: default; }
.blk { display: flex; flex-direction: column; gap: 6px; padding-top: 12px; border-top: 1px solid var(--c-rule); } .sh { margin: 0 0 2px; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--c-muted); } .sh em { font-style: normal; margin-left: 4px; color: var(--c-ink-soft); }
.add { display: flex; gap: 8px; } .add input { flex: 1; font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.chk.sm { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--c-ink-soft); } .chk.sm input { width: auto; }
.ir { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--c-rule); } .ir:last-child { border-bottom: 0; } .rq { background: var(--c-signal-soft); padding: 10px 12px; border-bottom: 0; margin-bottom: 4px; }
.who { display: flex; flex-direction: column; min-width: 0; gap: 1px; } .who b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; } .who em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .who q { font-size: 13px; color: var(--c-ink-soft); margin-top: 3px; }
.act { display: flex; gap: 6px; flex: none; }
@media (max-width: 760px) { .parts { grid-template-columns: 1fr; } .ir { flex-wrap: wrap; } }
</style>
