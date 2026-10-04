<script setup lang="ts">
// Investor updates and your investor list.
useHead({ title: 'Investor updates' })
const { data: ups, refresh } = await useFetch<{ id: string; title: string; period_type: string; period_end: string; status: string; published_at: string | null; sent: number; opened: number }[]>('/api/updates')
const { data: invs, refresh: rinv } = await useFetch<{ id: string; name: string; email: string; firm: string | null; sent: number; opened: number }[]>('/api/investors')
const tab = ref<'updates' | 'investors'>('updates')
const lastMonthEnd = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10) }
const n = reactive({ period_type: 'month', period_end: lastMonthEnd() })
const lines = ref(''); const msg = ref(''); const ok = ref('')
const err = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Something went wrong.'
async function start() { msg.value = ''; try { const r = await $fetch<{ id: string }>('/api/updates', { method: 'POST', body: n }); await navigateTo('/updates/' + r.id) } catch (e) { msg.value = err(e) } }
async function addInvestors() { msg.value = ''; ok.value = ''; try { const r = await $fetch<{ added: number }>('/api/investors', { method: 'POST', body: { lines: lines.value } }); ok.value = 'Added ' + r.added + '.'; lines.value = ''; await rinv() } catch (e) { msg.value = err(e) } }
const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
</script>
<template>
  <section>
    <p class="label">Investors</p><h1>Investor updates</h1>
    <p class="lead">Keep investors close with a short monthly or quarterly update. Add a few highlights; we draft it from your Financials for you to edit, publish on your investor page and email to your investors, and you see who opened it.</p>
    <nav class="tabs"><button :class="{ on: tab === 'updates' }" @click="tab = 'updates'">Updates ({{ ups?.length ?? 0 }})</button><button :class="{ on: tab === 'investors' }" @click="tab = 'investors'">Investors ({{ invs?.length ?? 0 }})</button></nav>
    <p v-if="msg" class="error">{{ msg }}</p><p v-if="ok" class="ok">{{ ok }}</p>
    <template v-if="tab === 'updates'">
      <form class="card new" @submit.prevent="start"><b>New update</b><select v-model="n.period_type"><option value="month">Monthly</option><option value="quarter">Quarterly</option></select><label>Period ending<input v-model="n.period_end" type="date" required></label><button class="btn" type="submit">Start</button></form>
      <div class="box"><table v-if="ups?.length"><tbody><tr v-for="u in ups" :key="u.id"><td><NuxtLink :to="'/updates/' + u.id" class="t">{{ u.title }}</NuxtLink><span class="s">{{ u.period_type === 'quarter' ? 'Quarterly' : 'Monthly' }} · {{ day(u.period_end) }}</span></td>
        <td><span class="tag" :class="u.status">{{ u.status === 'published' ? 'Published' : 'Draft' }}</span></td><td class="n">{{ u.sent ? u.opened + ' of ' + u.sent + ' opened' : 'Not sent' }}</td><td class="n"><DeleteButton type="update" :id="u.id" :name="u.title" link @deleted="refresh()" /></td></tr></tbody></table>
        <p v-else class="none">No updates yet. Start your first one above.</p></div>
    </template>
    <template v-else>
      <form class="card add" @submit.prevent="addInvestors"><b>Add investors</b><p class="muted">One per line: <code>Name &lt;email&gt;</code> or <code>Name, email, firm</code>. Paste a whole list at once.</p><textarea v-model="lines" rows="4" required /><button class="btn" type="submit">Add</button></form>
      <div class="box"><table v-if="invs?.length"><thead><tr><th>Investor</th><th>Firm</th><th class="n">Updates opened</th><th /></tr></thead><tbody><tr v-for="i in invs" :key="i.id"><td><b>{{ i.name }}</b><span class="s">{{ i.email }}</span></td><td>{{ i.firm ?? '—' }}</td><td class="n">{{ i.sent ? i.opened + ' of ' + i.sent : '—' }}</td><td class="n"><DeleteButton type="investor" :id="i.id" :name="i.name" link @deleted="rinv()" /></td></tr></tbody></table>
        <p v-else class="none">No investors yet.</p></div>
    </template>
  </section>
</template>
<style scoped>
.lead { color: var(--c-ink-soft); max-width: 780px; } .tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 14px 0; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.new { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; } .new label { display: flex; gap: 8px; align-items: center; font-size: 14px; } .add { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
select, input, textarea { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; } .box { background: #fff; border: 1px solid var(--c-rule); } table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 400; font-size: 13px; color: var(--c-muted); padding: 10px 14px; border-bottom: 1px solid var(--c-rule); } td { padding: 12px 14px; border-bottom: 1px solid var(--c-rule); font-size: 14px; } .n { text-align: right; } .t { font-weight: 500; } .s { display: block; font-size: 12.5px; color: var(--c-muted); }
.tag { font-size: 12px; padding: 3px 9px; background: var(--c-paper-2); } .tag.published { color: var(--c-ok); background: rgba(31,122,77,.1); } .none { padding: 18px; color: var(--c-muted); margin: 0; } .muted { color: var(--c-muted); font-size: 13px; margin: 0; } .error { color: var(--c-danger); } .ok { color: var(--c-ok); }
</style>
