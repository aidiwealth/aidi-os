<script setup lang="ts">
// Home: Finvry companies see their company dashboard; Aidi sees the group overview.
const { data: me } = await useFetch<{ org: { kind: string } | null; roles?: string[] }>('/api/auth/me', { key: 'me' })
if (me.value?.roles?.includes('wealth_client') && me.value.roles.every((r) => r === 'wealth_client')) await navigateTo('/w', { replace: true })
</script>
<template><CompanyDashboard v-if="me?.org?.kind === 'company'" /><GroupOverview v-else /></template>
