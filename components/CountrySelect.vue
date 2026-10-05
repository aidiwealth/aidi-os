<script setup lang="ts">
// Country picker with every country (keeps an existing free-text value as an option).
import { COUNTRIES } from '~/shared/countries'
const props = withDefaults(defineProps<{ modelValue: string | null | undefined; disabled?: boolean; placeholder?: string; required?: boolean }>(), { disabled: false, placeholder: 'Choose a country', required: false })
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
const list = computed(() => (props.modelValue && !COUNTRIES.includes(props.modelValue) ? [props.modelValue, ...COUNTRIES] : COUNTRIES))
</script>
<template>
  <select :value="modelValue ?? ''" :disabled="disabled" :required="required" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"><option value="" disabled>{{ placeholder }}</option><option v-for="c in list" :key="c" :value="c">{{ c }}</option></select>
</template>
