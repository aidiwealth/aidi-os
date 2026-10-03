// Which product this address shows: app.finvry.com is Finvry, everything else is Aidi OS.
export function useBrand(): { key: 'aidi' | 'finvry'; name: string } {
  const force = useRuntimeConfig().public.forceBrand
  const host = useRequestURL().host
  const key = force === 'finvry' || force === 'aidi' ? force : (/finvry/i.test(host) ? 'finvry' : 'aidi')
  return { key, name: key === 'finvry' ? 'Finvry' : 'Aidi OS' }
}
