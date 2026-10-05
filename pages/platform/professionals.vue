<script setup lang="ts">
useHead({ title: 'Finvry · Fund services' })
interface Pro { id: string; name: string; firm: string | null; title: string | null; services: string[]; jurisdictions: string[]; bio: string | null; email: string; phone: string | null; website: string | null; photo_url: string | null; featured: boolean; active: boolean; intros: number; intros30: number }
const { data, refresh } = await useFetch<{ professionals: Pro[]; services: Record<string, string> }>('/api/platform/professionals')
const editing = ref<string | null>(null)
const f = reactive({ id: '', name: '', firm: '', title: '', services: [] as string[], jurisdictions: '', bio: '', email: '', phone: '', website: '', photo_url: '', featured: false, active: true })
function edit(p?: Pro) {
  Object.assign(f, p ? { id: p.id, name: p.name, firm: p.firm ?? '', title: p.title ?? '', services: [...p.services], jurisdictions: p.jurisdictions.join(', '), bio: p.bio ?? '', email: p.email, phone: p.phone ?? '', website: p.website ?? '', photo_url: p.photo_url ?? '', featured: p.featured, active: p.active }
    : { id: '', name: '', firm: '', title: '', services: [], jurisdictions: '', bio: '', email: '', phone: '', website: '', photo_url: '', featured: false, active: true })
  editing.value = p?.id ?? 'new'
}
const msg = ref('')
async function save() {
  msg.value = ''
  try { await $fetch('/api/platform/professionals', { method: 'POST', body: { ...f, id: f.id || undefined, jurisdictions: f.jurisdictions.split(',').map((s) => s.trim()).filter(Boolean) } }); editing.value = null; await refresh() }
  catch (e) { msg.value = (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.' }
}
</script>

<template>
  <section v-if="data">
    <div class="head"><div><h1>Fund services</h1><p class="lead">Independent professionals shown to every workspace. Introductions are logged here. Charge listing or partnership fees rather than per-referral commissions.</p></div><button class="btn" type="button" @click="edit()">Add professional</button></div>
    <form v-if="editing" class="card frm" @submit.prevent="save">
      <label class="label">Name<input v-model="f.name" required maxlength="200"></label>
      <label class="label">Firm<input v-model="f.firm" maxlength="200"></label>
      <label class="label">Title<input v-model="f.title" maxlength="200" placeholder="e.g. Partner, Funds"></label>
      <label class="label">Email<input v-model="f.email" type="email" required maxlength="254"></label>
      <label class="label">Phone<input v-model="f.phone" maxlength="40"></label>
      <label class="label">Countries<input v-model="f.jurisdictions" placeholder="United States, Nigeria, United Kingdom"></label>
      <label class="label">Website<input v-model="f.website" placeholder="https://"></label>
      <label class="label">Photo or logo link<input v-model="f.photo_url" placeholder="https://"></label>
      <div class="flags"><label class="chk"><input v-model="f.featured" type="checkbox"> Featured</label><label class="chk"><input v-model="f.active" type="checkbox"> Shown to customers</label></div>
      <div class="wide svcs"><span class="label">Services</span><label v-for="(l, k) in data.services" :key="k" class="chk"><input v-model="f.services" type="checkbox" :value="k"> {{ l }}</label></div>
      <label class="label wide">Short bio<textarea v-model="f.bio" rows="3" maxlength="2000" /></label>
      <div class="wide row"><button class="btn" type="submit">Save</button><button class="btn secondary" type="button" @click="editing = null">Cancel</button><span v-if="msg" class="error">{{ msg }}</span></div>
    </form>
    <table class="table">
      <thead><tr><th>Professional</th><th>Services</th><th>Countries</th><th class="n">Introductions</th><th /></tr></thead>
      <tbody><tr v-for="p in data.professionals" :key="p.id" :class="{ off: !p.active }">
        <td><b class="co">{{ p.name }}</b><span v-if="p.featured" class="feat">Featured</span><span class="sub">{{ [p.title, p.firm].filter(Boolean).join(', ') }} · {{ p.email }}</span></td>
        <td class="sm">{{ p.services.map((s) => data!.services[s] ?? s).join(', ') }}</td><td class="sm">{{ p.jurisdictions.join(', ') }}</td>
        <td class="n">{{ p.intros }}<span class="sub">{{ p.intros30 }} in 30 days</span></td>
        <td class="acts"><button type="button" class="link" @click="edit(p)">Edit</button><DeleteButton type="professional" :id="p.id" :name="p.name" :url="'/api/platform/professionals/' + p.id" link @deleted="refresh()" /></td>
      </tr></tbody>
    </table>
    <EmptyState v-if="!data.professionals.length" compact icon="customers" title="No professionals listed yet" />
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; } .lead { color: var(--c-muted); margin: 6px 0 0; max-width: 680px; }
.frm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; margin-bottom: 16px; align-items: end; } .frm > label { display: flex; flex-direction: column; gap: 6px; } .wide { grid-column: 1 / -1; }
input, textarea { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--c-rule-strong); background: #fff; color: var(--c-ink); }
.chk { display: flex !important; flex-direction: row !important; gap: 8px; align-items: center; font-size: 13px; } .chk input { width: auto; }
.flags { display: flex; flex-direction: column; gap: 6px; } .svcs { display: flex; flex-wrap: wrap; gap: 8px 18px; } .svcs .label { width: 100%; }
.row { display: flex; gap: 10px; align-items: center; }
.table { width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid var(--c-rule); }
th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--c-rule); } td { padding: 10px 12px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } tr.off td { opacity: .5; } .n { text-align: right; }
.co { color: var(--c-navy); font-weight: 500; } .feat { margin-left: 8px; font-size: 11px; color: var(--c-blue-deep); } .sub { display: block; font-size: 12px; color: var(--c-muted); } .sm { font-size: 13px; }
.acts { white-space: nowrap; } .link { background: none; border: 0; padding: 0; font: inherit; color: var(--c-blue-deep); cursor: pointer; }
.muted { color: var(--c-muted); } .error { color: var(--c-danger); }
</style>
