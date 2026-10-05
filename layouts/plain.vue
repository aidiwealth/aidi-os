<template>
  <div class="plain"><slot /></div>
</template>

<style scoped>
.plain { min-height: var(--vh100); display: grid; place-items: center; padding: 24px;
  background: radial-gradient(1200px 600px at 10% -10%, rgba(95,168,211,.18), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(28,84,125,.12), transparent 60%), var(--c-paper-2); }
</style>
