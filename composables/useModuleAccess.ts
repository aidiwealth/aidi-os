// Which pages this person can open, from the modules list the layout already loaded (switched on and their role
// allowed on the Modules page). Tabs and dashboard sections use it to hide what they cannot use.
interface ModAccess { code: string; to: string; pages?: string[]; usable: boolean; locked?: boolean }
export function useModuleAccess() {
  const { data } = useNuxtData<ModAccess[]>('modules')
  const has = (code: string) => !data.value || data.value.some((m) => m.code === code && m.usable)
  const canPath = (path: string) => {
    const mods = data.value; if (!mods?.length) return true
    let best: ModAccess | null = null, len = -1
    for (const m of mods) for (const p of [m.to, ...(m.pages ?? [])]) if (p && (path === p || path.startsWith(p + '/')) && p.length > len) { best = m; len = p.length }
    return !best || best.usable
  }
  // Off for this person but available on a higher plan (shown with a lock rather than hidden).
  const locked = (code: string) => !!data.value?.some((m) => m.code === code && !m.usable && m.locked)
  return { has, canPath, locked }
}
