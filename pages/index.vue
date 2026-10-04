<script setup lang="ts">
// Home: Finvry companies see their company dashboard; Aidi sees the group overview.
const { data: me } = await useFetch<{ org: { kind: string } | null }>('/api/auth/me', { key: 'me' })
</script>
<template><CompanyDashboard v-if="me?.org?.kind === 'company'" /><GroupOverview v-else /></template>
