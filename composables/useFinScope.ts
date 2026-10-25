// Which company (or the consolidated group) the Financials pages are on. Kept in the address (?s=group,
// ?s=entity:<id>, ?s=company:<id>) so every sub-page (Overview, Statements, Consolidation, Revenue retention,
// Customers, What to do next, Reports) stays on it. A company with subsidiaries opens on the group; someone limited to
// some companies opens on their first; Aidi OS opens on the group.
export interface FinSubjects {
  company: { subject: string; name: string; currency: string; reporting: string | null; rate_as_of: string | null; structure?: 'single' | 'group' | null; group_name?: string } | null
  pages: { id: string; name: string; currency: string | null; main: boolean }[]; subs_hidden?: number
  entities: { id: string; name: string; kind: string }[]; companies: { id: string; name: string; relationship: string }[]
  currencies: string[]; paid: boolean; lines: { key: string; label: string; section: string }[]; derived: { key: string; label: string }[]
}
export interface FinOption { value: string; label: string; sub: string; group: boolean }
export async function useFinScope() {
  const route = useRoute(), router = useRouter()
  // Both started before any await: a composable loses the app's context after its first await.
  const pS = useFetch<FinSubjects>('/api/financials/subjects', { key: 'fin-subjects' })
  const pM = useFetch<{ roles: string[]; entity_scoped?: boolean }>('/api/auth/me', { key: 'me' })
  const [{ data: subj, refresh: refreshSubjects }, { data: me }] = await Promise.all([pS, pM])
  const scoped = computed(() => !!me.value?.entity_scoped)
  const co = computed(() => subj.value?.company ?? null)
  const pages = computed(() => subj.value?.pages ?? [])
  // Finvry company: the group (with subsidiaries) and each company. Aidi OS: the group, then funds and entities, then
  // portfolio and group companies.
  const options = computed<FinOption[]>(() => {
    if (co.value) {
      const ps = pages.value.map((p) => ({ value: 'entity:' + p.id, label: p.name, sub: (p.main ? 'Company' : 'Subsidiary') + (p.currency ? ' · ' + p.currency : ''), group: false }))
      return pages.value.length > 1 && !scoped.value ? [{ value: 'group', label: 'Group', sub: 'Consolidated', group: true }, ...ps] : ps
    }
    const s = subj.value
    return [...(scoped.value ? [] : [{ value: 'group', label: 'Group', sub: 'Consolidated', group: true }]),
      ...(s?.entities ?? []).map((e) => ({ value: 'entity:' + e.id, label: e.name, sub: e.kind === 'fund' ? 'Fund' : e.kind === 'spv' ? 'SPV' : 'Entity', group: false })),
      // Aidi OS: only the group's own entities and subsidiaries; portfolio companies have their own pages in Portfolio.
      ...(s?.companies ?? []).filter((c) => c.relationship === 'subsidiary').map((c) => ({ value: 'company:' + c.id, label: c.name, sub: 'Subsidiary', group: false }))]
  })
  const fallback = computed(() => options.value[0]?.value ?? (co.value?.subject ?? 'group'))
  const s = computed<string>({
    get: () => { const q = String(route.query.s ?? ''); return options.value.some((o) => o.value === q) ? q : fallback.value },
    set: (v) => { void router.replace({ query: { ...route.query, s: v } }) },
  })
  const isGroup = computed(() => s.value === 'group')
  const entityId = computed(() => (s.value.startsWith('entity:') ? s.value.slice(7) : null))
  const current = computed(() => options.value.find((o) => o.value === s.value) ?? null)
  // The page's currency: a company page its own; the group the reporting currency (else the company's).
  const currencyOf = (v: string) => (v === 'group' ? co.value?.reporting ?? co.value?.currency ?? subj.value?.currencies[0] ?? 'USD' : pages.value.find((p) => 'entity:' + p.id === v)?.currency ?? co.value?.currency ?? 'USD')
  const hasGroup = computed(() => options.value.some((o) => o.group))
  // The group's own name (set by the founder), else the main company's name with "group".
  const groupName = computed(() => co.value?.group_name || ((pages.value.find((p) => p.main)?.name ?? co.value?.name ?? '') + ' group').trim())
  return { subj, refreshSubjects, me, scoped, co, pages, options, s, isGroup, entityId, current, currencyOf, hasGroup, groupName }
}
