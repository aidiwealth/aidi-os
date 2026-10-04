<script setup lang="ts">
// Investor updates: everything sent and drafted, who it went to, pin, duplicate and templates.
useHead({ title: 'Investor updates' })
interface U { id: string; title: string; period_type: string; period_end: string; status: string; published_at: string | null; created_at: string; sent_at: string | null; sent_count: number; sent_to: string[]; from_name: string | null; pinned: boolean; is_template: boolean; opened: number }
const { data, refresh } = await useFetch<U[]>('/api/updates')
const view = ref<'all' | 'sent' | 'drafts'>('all'); const q = ref('')
const list = computed(() => (data.value ?? []).filter((u) => !u.is_template && (view.value === 'all' || (view.value === 'sent' ? !!u.sent_at : !u.sent_at)) && (!q.value || u.title.toLowerCase().includes(q.value.toLowerCase()))))
const templates = computed(() => (data.value ?? []).filter((u) => u.is_template))
const ago = (d: string) => { const s = (Date.now() - new Date(d).getTime()) / 1000; const m = s / 2629800; return m >= 12 ? Math.floor(m / 12) + (Math.floor(m / 12) === 1 ? ' year ago' : ' years ago') : m >= 1 ? Math.floor(m) + (Math.floor(m) === 1 ? ' month ago' : ' months ago') : s > 86400 ? Math.floor(s / 86400) + ' days ago' : s > 3600 ? Math.floor(s / 3600) + ' hours ago' : 'just now' }
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
const msg = ref(''); const menu = ref('')
const lastMonthEnd = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10) }
const nu = reactive({ open: false, period_type: 'month', period_end: lastMonthEnd(), template: '' })
async function create() { msg.value = ''; try { const r = nu.template ? await $fetch<{ id: string }>('/api/updates/' + nu.template + '/duplicate', { method: 'POST', body: { as: 'from_template' } }) : await $fetch<{ id: string }>('/api/updates', { method: 'POST', body: { period_type: nu.period_type, period_end: nu.period_end } }); await navigateTo('/updates/' + r.id) } catch (e) { msg.value = err(e) } }
async function dup(u: U, as: string) { menu.value = ''; try { const r = await $fetch<{ id: string }>('/api/updates/' + u.id + '/duplicate', { method: 'POST', body: { as } }); if (as === 'template') { await refresh(); tpl.value = true } else await navigateTo('/updates/' + r.id) } catch (e) { msg.value = err(e) } }
async function pin(u: U) { await $fetch('/api/updates/' + u.id + '/pin', { method: 'POST' }); await refresh() }
const tpl = ref(false)
</script>
<template>
  <section v-if="data">
    <p class="label">Investors</p>
    <div class="hd"><div class="tt"><h1>Updates</h1><select v-model="view" aria-label="Filter"><option value="all">All updates</option><option value="sent">Sent</option><option value="drafts">Drafts</option></select></div>
      <div class="row"><input v-model="q" placeholder="Search updates" aria-label="Search"><button class="btn secondary" @click="tpl = true">Templates ({{ templates.length }})</button><NuxtLink to="/contacts" class="btn secondary">Contacts</NuxtLink><button class="btn" @click="nu.open = true">New update</button></div></div>
    <p v-if="msg" class="error">{{ msg }}</p>
    <div class="box"><table v-if="list.length"><thead><tr><th>Title</th><th>Sent by</th><th>Sent</th><th>Created</th><th /></tr></thead>
      <tbody><tr v-for="u in list" :key="u.id"><td><NuxtLink :to="'/updates/' + u.id" class="t">{{ u.title }}</NuxtLink> <span class="st" :class="u.sent_at ? 'sent' : u.status">{{ u.sent_at ? '✓ Sent' : u.status === 'published' ? 'Published' : 'Draft' }}</span>
          <span class="sub">{{ u.sent_at ? 'Sent to ' + u.sent_count + ' people' + (u.sent_to.length ? ' · ' + u.sent_to.join(', ') : '') + ' · ' + u.opened + ' opened' : (u.period_type === 'quarter' ? 'Quarterly' : 'Monthly') + ' · not sent yet' }}</span></td>
        <td class="mut">{{ u.from_name ?? '—' }}</td><td class="mut">{{ u.sent_at ? ago(u.sent_at) : '—' }}</td><td class="mut">{{ ago(u.created_at) }}</td>
        <td class="act"><button class="ic" :class="{ on: u.pinned }" :title="u.pinned ? 'Unpin' : 'Pin to top'" @click="pin(u)">{{ u.pinned ? '★' : '☆' }}</button><span class="mw"><button class="ic" title="More" @click="menu = menu === u.id ? '' : u.id">⋯</button>
          <span v-if="menu === u.id" class="mn"><button @click="dup(u, 'copy')">Duplicate</button><button @click="dup(u, 'template')">Save as template</button><DeleteButton type="update" :id="u.id" :name="u.title" link @deleted="menu = ''; refresh()" /></span></span></td></tr></tbody></table>
      <div v-else class="none"><b>{{ q ? 'No updates match.' : 'No updates yet' }}</b><p v-if="!q">Send your investors a short monthly or quarterly update: your numbers as charts, highlights, and how they can help.</p><button v-if="!q" class="btn" @click="nu.open = true">Write your first update</button></div></div>
    <AppModal :open="nu.open" title="New update" @close="nu.open = false">
      <div class="frm"><label class="label">Start from<select v-model="nu.template"><option value="">A blank update</option><option v-for="t in templates" :key="t.id" :value="t.id">Template: {{ t.title }}</option></select></label>
        <template v-if="!nu.template"><label class="label">Type<select v-model="nu.period_type"><option value="month">Monthly update</option><option value="quarter">Quarterly update</option></select></label><label class="label">Period ending<input v-model="nu.period_end" type="date"></label></template></div>
      <template #foot><button class="btn secondary" @click="nu.open = false">Cancel</button><button class="btn" @click="create">Create</button></template>
    </AppModal>
    <AppModal :open="tpl" title="Templates" @close="tpl = false">
      <p v-if="!templates.length" class="mut">No templates yet. Open any update's ⋯ menu and choose "Save as template" to reuse its layout, charts and recipients.</p>
      <div v-for="t in templates" :key="t.id" class="tp"><span>{{ t.title }}</span><span class="row"><button class="btn sm" @click="nu.template = t.id; tpl = false; create()">Use</button><NuxtLink :to="'/updates/' + t.id" class="btn secondary sm">Edit</NuxtLink></span></div>
    </AppModal>
  </section>
</template>
<style scoped>
.hd { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; } .tt { display: flex; gap: 12px; align-items: center; } .tt h1 { margin: 0; } .tt select { background: var(--c-paper-2); border: 0; padding: 6px 10px; font: inherit; font-size: 13.5px; }
.row { display: flex; gap: 8px; align-items: center; } .row a { text-decoration: none; } input, select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.box { background: #fff; border: 1px solid var(--c-rule); } table { width: 100%; border-collapse: collapse; } th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--c-muted); padding: 10px 16px; border-bottom: 1px solid var(--c-rule); } td { padding: 14px 16px; border-bottom: 1px solid var(--c-rule); font-size: 14px; vertical-align: top; }
.t { font-weight: 600; color: var(--c-ink); text-decoration: none; font-size: 15px; } .sub { display: block; font-size: 13px; color: var(--c-muted); margin-top: 3px; } .st { font-size: 12px; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-muted); margin-left: 6px; } .st.sent, .st.published { background: rgba(31,122,77,.1); color: var(--c-ok); }
.mut { color: var(--c-muted); font-size: 13.5px; } .act { white-space: nowrap; text-align: right; } .ic { background: none; border: 0; font-size: 17px; color: var(--c-muted); cursor: pointer; padding: 2px 6px; } .ic.on { color: #e6a020; } .mw { position: relative; }
.mn { position: absolute; right: 0; top: 26px; background: #fff; border: 1px solid var(--c-rule); box-shadow: var(--shadow-pop); z-index: 20; display: flex; flex-direction: column; min-width: 170px; padding: 6px; text-align: left; } .mn button { background: none; border: 0; padding: 8px 10px; font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; } .mn button:hover { background: var(--c-paper-2); }
.none { padding: 32px; text-align: center; } .none p { color: var(--c-ink-soft); max-width: 460px; margin: 6px auto 14px; } .frm { display: flex; flex-direction: column; gap: 12px; } label.label { display: flex; flex-direction: column; gap: 6px; }
.tp { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--c-rule); } .btn.sm { padding: 5px 12px; font-size: 13px; text-decoration: none; } .error { color: var(--c-danger); }
</style>
