// Banking and the Stage Monitor follow the company chosen at the top (or the whole group), like
// Financials: the choice is kept in the address (?s=) and sent to the server as ?cust=<company id>|group. `sf` is
// $fetch with the choice added, for the page's own calls.
export async function useCoScope() {
  const fs = await useFinScope()
  const cust = computed<string | undefined>(() => (!fs.co.value ? undefined : fs.isGroup.value ? 'group' : fs.entityId.value ?? undefined))
  const many = computed(() => !!fs.co.value && fs.options.value.length > 1)
  const sf = $fetch.create({ onRequest({ options }) { if (cust.value) options.query = { ...(options.query ?? {}), cust: cust.value } } })
  const companies = computed(() => fs.pages.value.map((p) => ({ id: p.id, name: p.name, currency: p.currency, main: p.main })))
  return { ...fs, cust, many, sf, companies }
}
