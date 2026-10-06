<script setup lang="ts">
// Settings: Finvry companies get the company settings; Aidi keeps its workspace settings.
const { data: me } = await useFetch<{ org: { kind: string } | null }>('/api/auth/me', { key: 'me' })
</script>
<template><div class="stw"><StorageCard /></div><CompanySettings v-if="me?.org?.kind === 'company'" /><template v-else><WorkspaceSettings /><div class="apis"><ApiKeys /></div></template></template>

<style scoped>
.stw { max-width: 920px; margin: 0 0 16px; }
</style>
