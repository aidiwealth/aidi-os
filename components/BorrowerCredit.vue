<script setup lang="ts">
// Everything about a borrower's credit in one place: the business report (CreditChek or manual review), a bureau
// report upload for countries without a connected bureau, and the founders/guarantors.
const props = defineProps<{ borrowerId: string }>()
const { data, refresh } = await useFetch<{ country: string | null; nigeria: boolean; business_reports: { id: string; score: number | null; source: string | null; note: string | null; created_at: string }[] }>(() => '/api/credit/borrowers/' + props.borrowerId + '/guarantors', { key: 'bc-' + props.borrowerId })
const k = ref(0)
</script>
<template>
  <div class="bcr"><CreditReport :key="'r' + k" :borrower-id="borrowerId" @changed="refresh()" />
    <div v-if="data && !data.nigeria" class="up"><BureauUpload :borrower-id="borrowerId" label="Business bureau report (Dun & Bradstreet, Experian Business, Equifax Business…)" @saved="k++; refresh()" />
      <div v-for="r in data.business_reports" :key="r.id" class="rf"><span>{{ r.source ?? 'Report' }}{{ r.score ? ' · ' + r.score : '' }} · {{ new Date(r.created_at).toLocaleDateString('en-GB') }}</span><a :href="'/api/credit/checks/' + r.id + '/file'" target="_blank">Open report</a></div></div>
    <GuarantorsPanel :borrower-id="borrowerId" /></div>
</template>
<style scoped>
.bcr { display: flex; flex-direction: column; gap: 12px; } .up { display: flex; flex-direction: column; gap: 6px; } .rf { display: flex; justify-content: space-between; font-size: 13px; border-top: 1px solid var(--c-rule); padding-top: 6px; } .rf a { color: var(--c-blue-deep); }
</style>
