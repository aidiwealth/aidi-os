<script setup lang="ts">
// Settings: Finvry companies get the company settings; Aidi keeps its workspace settings.
const { data: me } = await useFetch<{ org: { kind: string } | null }>('/api/auth/me', { key: 'me' })
</script>
<template><CompanySettings v-if="me?.org?.kind === 'company'" /><template v-else><WorkspaceSettings /><div class="apis"><ApiKeys /></div></template></template>
