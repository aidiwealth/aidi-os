<script setup lang="ts">
// Trusts & governance: who holds which role in each trust and company (the register), and the resolutions, minutes,
// consents and distributions those people approve. Active entities by default; forming and closed ones one click away.
useHead({ title: 'Trusts & governance' })
interface Ent { id: string; name: string; kind: string; status: string; jurisdiction: string | null; parent: string | null; parties: number; signers: { name: string; role: string }[]; beneficiaries: number; resolutions: number; open: number; last_paper: string | null }
interface Await { id: string; title: string; kind: string; entity: string; circulated_at: string }
const { data, error } = await useFetch<{ entities: Ent[]; awaiting: Await[] }>('/api/governance')
const KIND: Record<string, string> = { holding: 'Holding company', operating: 'Operating company', fund: 'Fund', gp: 'General partner', management_company: 'Management company', trust: 'Trust', household: 'Household', spv: 'SPV', other: 'Other' }
const ROLE: Record<string, string> = { settlor: 'Settlor', trustee: 'Trustee', successor_trustee: 'Successor trustee', protector: 'Protector', director: 'Director', officer: 'Officer', member: 'Member', signatory: 'Signatory' }
const RK: Record<string, string> = { resolution: 'Resolution', minutes: 'Minutes', distribution: 'Distribution', consent: 'Written consent' }
const FILTERS = [['active', 'Active'], ['forming', 'Being set up'], ['inactive', 'Dormant or closed']] as const
const route = useRoute(), router = useRouter()
const filter = computed(() => (FILTERS.some((f) => f[0] === route.query.f) ? String(route.query.f) : 'active'))
const setFilter = (f: string) => router.replace({ query: { ...route.query, f } })
const inFilter = (e: Ent, f: string) => (f === 'active' ? e.status === 'active' : f === 'forming' ? e.status === 'forming' : ['dormant', 'closed'].includes(e.status))
const all = computed(() => data.value?.entities ?? [])
const shown = computed(() => all.value.filter((e) => inFilter(e, filter.value)))
const trusts = computed(() => shown.value.filter((e) => e.kind === 'trust'))
const others = computed(() => shown.value.filter((e) => e.kind !== 'trust'))
const count = (f: string) => all.value.filter((e) => inFilter(e, f)).length
const activeAll = computed(() => all.value.filter((e) => e.status === 'active'))
const withRegister = computed(() => activeAll.value.filter((e) => e.parties > 0).length)
const openTotal = computed(() => all.value.reduce((s, e) => s + e.open, 0))
const who = (e: Ent) => e.signers.slice(0, 3).map((s) => s.name + ' (' + (ROLE[s.role] ?? s.role).toLowerCase() + ')').join(', ') + (e.signers.length > 3 ? ' +' + (e.signers.length - 3) : '')
const day = (d: string | null) => (d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
const howOpen = ref(false)
</script>

<template>
  <section class="gv">
    <p class="label">Family Office</p>
    <div class="hd"><h1>Trusts &amp; governance</h1><button type="button" class="lk" :aria-expanded="howOpen" @click="howOpen = !howOpen">How this works</button></div>
    <p class="lead">Keep a register of who holds each role in our trusts and companies (trustees, directors, beneficiaries), and get their written approval on resolutions, minutes, consents and distributions.</p>
    <div v-if="howOpen" class="how">
      <div><b>1. Register</b><span>Open an entity and add its people and roles. Trustees, directors, members and signatories approve papers; beneficiaries receive distributions.</span></div>
      <div><b>2. Draft</b><span>Write a resolution, minutes, consent or distribution, or describe it and AI drafts it from the register.</span></div>
      <div><b>3. Approve</b><span>Circulate it. Each signatory signs in with the email on the register and approves; once enough approve it is final and kept with the entity.</span></div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error.statusCode === 403 ? 'Trusts & governance is limited to family members and GPs.' : 'Could not load.' }}</p>
    <template v-else-if="data">
      <div class="fx-stats four">
        <StatTile icon="building" tone="n" label="Active entities" :value="activeAll.length" full :note="count('forming') ? count('forming') + ' being set up' : 'Trusts and companies'" />
        <StatTile icon="users" tone="b" label="With a register" :value="withRegister + ' of ' + activeAll.length" full note="People and roles recorded" />
        <StatTile icon="doc" tone="a" label="Awaiting approval" :value="openTotal" full note="Papers circulating" />
        <StatTile icon="check" tone="c" label="Awaiting you" :value="data.awaiting.length" full :note="data.awaiting.length ? 'Needs your signature' : 'Nothing to sign'" />
      </div>

      <div v-if="data.awaiting.length" class="card aw">
        <h2>Awaiting your signature</h2>
        <NuxtLink v-for="a in data.awaiting" :key="a.id" :to="'/governance/resolutions/' + a.id" class="ar"><span><b>{{ a.title }}</b><em>{{ RK[a.kind] ?? a.kind }} · {{ a.entity }} · circulated {{ day(a.circulated_at) }}</em></span><span class="go">Review and sign ›</span></NuxtLink>
      </div>

      <nav class="tabs" aria-label="Filter"><button v-for="f in FILTERS" :key="f[0]" type="button" :class="{ on: filter === f[0] }" @click="setFilter(f[0])">{{ f[1] }}<span class="ct">{{ count(f[0]) }}</span></button></nav>

      <template v-if="trusts.length">
        <h2 class="h2">Trusts</h2>
        <div class="tg">
          <NuxtLink v-for="e in trusts" :key="e.id" :to="'/governance/' + e.id" class="card tc">
            <div class="th"><b>{{ e.name }}</b><span v-if="e.status !== 'active'" class="pill">{{ e.status === 'forming' ? 'Being set up' : e.status === 'dormant' ? 'Dormant' : 'Closed' }}</span></div>
            <span class="mut">{{ [e.jurisdiction, e.parent ? 'under ' + e.parent : null].filter(Boolean).join(' · ') || 'Trust' }}</span>
            <div class="tm">
              <div><em>Key people</em><b>{{ e.signers.length || '—' }}</b></div>
              <div><em>Beneficiaries</em><b>{{ e.beneficiaries || '—' }}</b></div>
              <div><em>Open papers</em><b :class="{ hot: e.open }">{{ e.open || '—' }}</b></div>
            </div>
            <span class="wh">{{ e.signers.length ? who(e) : 'No register yet: add the settlor, trustees and beneficiaries' }}</span>
          </NuxtLink>
        </div>
      </template>

      <template v-if="others.length">
        <h2 class="h2">Companies and funds</h2>
        <div class="card tw">
          <table class="t" data-nosearch>
            <thead><tr><th>Entity</th><th>Key people</th><th class="r">Papers</th><th class="r">Awaiting approval</th><th>Last paper</th></tr></thead>
            <tbody><tr v-for="e in others" :key="e.id" @click="navigateTo('/governance/' + e.id)">
              <td><NuxtLink :to="'/governance/' + e.id" class="co" @click.stop>{{ e.name }}</NuxtLink><span class="sub">{{ KIND[e.kind] ?? e.kind }}<template v-if="e.jurisdiction"> · {{ e.jurisdiction }}</template><template v-if="e.parent"> · under {{ e.parent }}</template></span></td>
              <td :class="{ mut: !e.signers.length }">{{ e.signers.length ? who(e) : 'No register yet' }}</td>
              <td class="r">{{ e.resolutions || '—' }}</td>
              <td class="r" :class="{ hot: e.open }">{{ e.open || '—' }}</td>
              <td class="mut">{{ day(e.last_paper) || '—' }}</td>
            </tr></tbody>
          </table>
        </div>
      </template>
      <EmptyState v-if="!shown.length" card icon="entities" :title="filter === 'active' ? 'No active entities' : filter === 'forming' ? 'Nothing being set up' : 'No dormant or closed entities'" text="Entities and their status are managed under Entities." />
    </template>
  </section>
</template>

<style scoped>
.gv { display: flex; flex-direction: column; }
.hd { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; } .hd h1 { margin: 0; }
.lead { color: var(--c-muted); margin: 8px 0 4px; max-width: 80ch; font-size: 14.5px; }
.lk { background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; color: var(--c-blue-deep); cursor: pointer; }
.how { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; border: 1px solid var(--c-rule); background: #fff; margin: 12px 0 0; } .how > div { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--c-ink-soft); } .how > div + div { border-left: 1px solid var(--c-rule); } .how b { color: var(--c-navy); font-size: 13.5px; }
.four { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
.aw { display: flex; flex-direction: column; margin-bottom: 18px; padding: 16px 20px; } .aw h2 { font-size: 15px; margin: 0 0 6px; }
.ar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--c-rule); text-decoration: none; color: inherit; } .ar span:first-child { display: flex; flex-direction: column; } .ar b { font-size: 14px; color: var(--c-ink); font-weight: 600; } .ar em { font-style: normal; font-size: 12.5px; color: var(--c-muted); } .go { font-size: 13px; color: var(--c-blue-deep); white-space: nowrap; }
.tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--c-rule); margin: 0 0 18px; } .tabs button { background: none; border: 0; padding: 10px 0; font: inherit; font-size: 14.5px; color: var(--c-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: flex; gap: 6px; align-items: center; } .tabs .on { color: var(--c-navy); border-bottom-color: var(--c-navy); font-weight: 500; }
.ct { font-size: 11px; font-weight: 600; padding: 0 6px; background: var(--c-paper-2); color: var(--c-muted); }
.h2 { font-size: 16px; margin: 0 0 10px; }
.tg { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; margin-bottom: 24px; }
.tc { display: flex; flex-direction: column; gap: 4px; text-decoration: none; color: inherit; padding: 18px 20px; transition: border-color .12s; } .tc:hover { border-color: var(--c-navy); }
.th { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .th b { font-size: 16.5px; color: var(--c-navy); font-weight: 600; }
.pill { font-size: 11.5px; font-weight: 600; padding: 2px 8px; background: var(--c-paper-2); color: var(--c-muted); white-space: nowrap; }
.tm { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--c-rule); border-bottom: 1px solid var(--c-rule); margin: 10px 0 8px; } .tm > div { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; } .tm > div + div { padding-left: 14px; border-left: 1px solid var(--c-rule); }
.tm em { font-style: normal; font-size: 12px; color: var(--c-muted); } .tm b { font-size: 19px; font-weight: 500; color: var(--c-navy); }
.wh { font-size: 12.5px; color: var(--c-ink-soft); }
.tw { padding: 0; overflow-x: auto; }
.t { width: 100%; border-collapse: collapse; font-size: 13.5px; } .t th { text-align: left; font-weight: 500; font-size: 12px; color: var(--c-muted); padding: 10px 18px; background: #fbfaf7; border-bottom: 1px solid var(--c-rule); white-space: nowrap; }
.t td { padding: 12px 18px; border-bottom: 1px solid var(--c-rule); vertical-align: top; } .t tbody tr { cursor: pointer; } .t tbody tr:hover { background: var(--c-paper-3); } .t tbody tr:last-child td { border-bottom: 0; } .t .r { text-align: right; }
.co { color: var(--c-navy); font-weight: 600; text-decoration: none; } .sub { display: block; font-size: 12px; color: var(--c-muted); margin-top: 2px; }
.mut { color: var(--c-muted); font-size: 12.5px; } .hot { color: var(--c-blue-deep); font-weight: 600; } .error { color: var(--c-danger); }
@media (max-width: 900px) { .four { grid-template-columns: 1fr 1fr !important; } .how { grid-template-columns: 1fr; } .how > div + div { border-left: 0; border-top: 1px solid var(--c-rule); } }
</style>
