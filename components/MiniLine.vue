<script setup lang="ts">
// Small line chart for a series of numbers (prices, rates, net worth).
const props = withDefaults(defineProps<{ values: number[]; color?: string; height?: number; second?: number[]; secondColor?: string }>(), { color: '#1c4f9c', height: 60, second: () => [], secondColor: '#9aa3ad' })
const W = 300
function d(vals: number[], all: number[]) { if (vals.length < 2) return ''; const lo = Math.min(...all), hi = Math.max(...all), H = props.height; return vals.map((v, i) => (i ? 'L' : 'M') + ((i / (vals.length - 1)) * (W - 4) + 2).toFixed(1) + ' ' + (H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8)).toFixed(1)).join(' ') }
const all = computed(() => [...props.values, ...props.second])
</script>
<template><svg :viewBox="'0 0 ' + W + ' ' + height" preserveAspectRatio="none" class="ml" :style="{ height: height + 'px' }"><path v-if="second.length > 1" :d="d(second, all)" fill="none" :stroke="secondColor" stroke-width="2" stroke-dasharray="4 4" /><path :d="d(values, all)" fill="none" :stroke="color" stroke-width="2.4" stroke-linejoin="round" /></svg></template>
<style scoped>.ml { width: 100%; display: block; }</style>
