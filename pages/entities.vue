<script setup lang="ts">
useHead({ title: 'Entities' })
interface Ent { id: string; name: string; legal_name: string | null; kind: string; jurisdiction: string | null; status: string; parent_id: string | null; parent_name: string | null; deals: number; companies: number; documents: number }
const { data, refresh } = await useFetch<Ent[]>('/api/entities')
const { data: me } = await useFetch<{ roles: string[] }>('/api/auth/me')
const isAdmin = computed(() => me.value?.roles.includes('admin'))
const KIND: Record<string, string> = { holding: 'Holding', operating: 'Operating company', fund: 'Fund', gp: 'General partner', management_company: 'Management company', trust: 'Trust', household: 'Household', spv: 'SPV', other: 'Other' }
const form = reactive({ id: '', name: '', legal_name: '', kind: 'operating', jurisdiction: '', status: 'active', parent_id: '' })
const open = ref(false)
const msg = ref('')
function edit(e?: Ent) {
  Object.assign(form, e ? { id: e.id, name: e.name, legal_name: e.legal_name ?? '', kind: e.kind, jurisdiction: e.jurisdiction ?? '', status: e.status, parent_id: e.parent_id ?? '' }
    : { id: '', name: '', legal_name: '', kind: 'operating', jurisdiction: '', status: 'active', parent_id: '' })
  open.value = true
}
async function save() {
  msg.value = ''
  try { await $fetch('/api/entities', { method: 'POST', body: { ...form, id: form.id || undefined, parent_id: form.parent_id || null } }); open.value = false; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' }
}
</script>

<template>
  <section>
    <p class="label">Family Office</p>
    <div class="head"><h1>Entities</h1><button v-if="isAdmin" class="btn" type="button" @click="edit()">Add entity</button></div>
    <p class="lead">The group's companies, funds and trusts. Deals are tagged to the vehicle that invests, portfolio companies to the entity that holds them, and documents to the entity they belong to.</p>
    <form v-if="open" class="card frm" @submit.prevent="save">
      <label class="label">Name<input v-model="form.name" required maxlength="200"></label>
      <label class="label">Legal name<input v-model="form.legal_name" maxlength="300"></label>
      <label class="label">Type<select v-model="form.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></label>
      <label class="label">Jurisdiction<input v-model="form.jurisdiction" maxlength="20" placeholder="e.g. US-DE, NG"></label>
      <label class="label">Status<select v-model="form.status"><option value="active">Active</option><option value="forming">Forming</option><option value="dormant">Dormant</option><option value="closed">Closed</option></select></label>
      <label class="label">Owned by<select v-model="form.parent_id"><option value="">—</option><option v-for="e in (data ?? []).filter((x) => x.id !== form.id)" :key="e.id" :value="e.id">{{ e.name }}</option></select></label>
      <div class="actions"><button class="btn" type="submit">Save</button><button class="btn secondary" type="button" @click="open = false">Cancel</button></div>
      <p v-if="msg" class="error" role="alert">{{ msg }}</p>
    </form>
    <table class="table">
      <thead><tr><th>Entity</th><th>Type</th><th>Status</th><th>Deals</th><th>Companies held</th><th>Documents</th><th v-if="isAdmin" /></tr></thead>
      <tbody>
        <tr v-for="e in data ?? []" :key="e.id">
          <td><b>{{ e.name }}</b><span class="sub">{{ [e.jurisdiction, e.parent_name ? 'owned by ' + e.parent_name : ''].filter(Boolean).join(' · ') }}</span></td>
          <td>{{ KIND[e.kind] ?? e.kind }}</td><td><span class="st" :data-s="e.status">{{ e.status }}</span></td>
          <td>{{ e.deals || '—' }}</td><td>{{ e.companies || '—' }}</td><td>{{ e.documents || '—' }}</td>
          <td v-if="isAdmin"><button type="button" class="link" @click="edit(e)">Edit</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; margin: 4px 0 8px; }
.lead { color: var(--c-muted); margin: 0 0 20px; max-width: 75ch; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 20px; } .frm label { display: flex; flex-direction: column; gap: 6px; }
.actions { display: flex; gap: 10px; align-items: end; }
input, select { font: inherit; font-size: 14px; letter-spacing: normal; text-transform: none; color: var(--c-ink); padding: 8px 10px; border: 1px solid var(--c-rule-strong); background: #fff; }
.table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--c-rule); }
th { text-align: left; font-size: var(--type-label); letter-spacing: .14em; text-transform: uppercase; color: var(--c-muted); font-weight: 500; padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
td { padding: 12px 16px; border-bottom: 1px solid var(--c-rule); }
b { color: var(--c-navy); font-weight: 500; } .sub { display: block; font-size: 12px; color: var(--c-muted); }
.st { font-size: 12px; text-transform: capitalize; } .st[data-s="forming"] { color: var(--c-warn); } .st[data-s="active"] { color: var(--c-ok); } .st[data-s="closed"], .st[data-s="dormant"] { color: var(--c-muted); }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.error { color: var(--c-danger); }
@media (max-width: 1000px) { .frm { grid-template-columns: 1fr; } }
</style>
