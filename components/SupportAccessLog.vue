<script setup lang="ts">
// Settings → Support access: when Finvry support opened this account, as whom, why, and what they changed.
interface V { id: string; reason: string; can_edit: boolean; started_at: string; expires_at: string; ended_at: string | null; by_name: string; as_email: string; changes: { at: string; what: string }[] }
const { data, error } = await useLazyFetch<{ visits: V[] }>('/api/company/support-access', { server: false })
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const mins = (v: V) => Math.max(1, Math.round((Date.parse(v.ended_at ?? v.expires_at) - Date.parse(v.started_at)) / 60000))
const open = (v: V) => !v.ended_at && Date.parse(v.expires_at) > Date.now()
</script>
<template>
  <div class="card sa">
    <h2>Support access</h2>
    <p class="muted">When you ask for help, Finvry support may open your account as one of your team to see what you see. Each visit is listed here with the reason. Visits are view only unless changes were needed; they end after 30 minutes and can never move money, change your plan, keys or team, or sign documents.</p>
    <p v-if="error" class="muted">Only workspace admins can see support access.</p>
    <p v-else-if="data && !data.visits.length" class="muted none">Finvry support has not opened your account.</p>
    <ul v-else-if="data" class="vl">
      <li v-for="v in data.visits" :key="v.id">
        <div class="vh"><b>{{ v.by_name }}</b><span class="tag" :class="{ ed: v.can_edit }">{{ v.can_edit ? 'Changes allowed' : 'View only' }}</span><span v-if="open(v)" class="tag on">Open now</span></div>
        <span class="mt">{{ when(v.started_at) }} · as {{ v.as_email }} · {{ open(v) ? 'until ' + when(v.expires_at) : mins(v) + ' min' }}</span>
        <p class="why">{{ v.reason }}</p>
        <details v-if="v.changes.length"><summary>{{ v.changes.length }} change{{ v.changes.length === 1 ? '' : 's' }} made</summary><ul><li v-for="(c, i) in v.changes" :key="i">{{ when(c.at) }} · {{ c.what }}</li></ul></details>
      </li>
    </ul>
  </div>
</template>
<style scoped>
.sa h2 { margin: 0 0 6px; } .muted { color: var(--c-muted); font-size: 13.5px; margin: 0 0 12px; line-height: 1.5; } .none { margin: 0; }
.vl { list-style: none; margin: 0; padding: 0; } .vl > li { padding: 12px 0; border-top: 1px solid var(--c-rule); display: flex; flex-direction: column; gap: 4px; }
.vh { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .vh b { font-weight: 500; color: var(--c-navy); font-size: 14px; }
.tag { font-size: 11.5px; padding: 2px 8px; background: var(--c-paper-2, #f4f6fa); color: var(--c-ink-soft); } .tag.ed { background: #fbeee6; color: #8a3d12; } .tag.on { background: #e8eef8; color: var(--c-navy); }
.mt { font-size: 12.5px; color: var(--c-muted); } .why { margin: 2px 0 0; font-size: 13.5px; color: var(--c-ink-soft); }
details { font-size: 12.5px; color: var(--c-muted); } summary { cursor: pointer; color: var(--c-blue-deep); } details ul { margin: 6px 0 0; padding-left: 18px; }
</style>
