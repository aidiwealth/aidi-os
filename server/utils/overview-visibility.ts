// What each role sees on the Overview page and its analytics tabs, set by admins on the Overview ("Who sees what").
// Stored per workspace; a section not set is shown to everyone allowed to use it. Admins always see everything.
export const OVERVIEW_SECTIONS: { key: string; label: string; tab?: boolean }[] = [
  { key: 'chart_pitches', label: 'Pitches received chart' }, { key: 'chart_portfolio', label: 'Portfolio revenue chart' }, { key: 'chart_fees', label: 'Fees earned chart' },
  { key: 'attention', label: 'Needs attention' }, { key: 'activity', label: 'Recent activity' }, { key: 'meetings', label: 'Team meetings' },
  { key: 'tab_vc', label: 'Venture capital tab', tab: true }, { key: 'tab_fo', label: 'Family office tab', tab: true }, { key: 'tab_cs', label: 'Client services tab', tab: true }, { key: 'tab_wm', label: 'Wealth management tab', tab: true }
]
export const OVERVIEW_ROLES = ['gp', 'team', 'family', 'adviser'] as const
export async function overviewVisibility(): Promise<Record<string, string[]>> {
  const v = (await currentOrg())?.settings.overview_visible
  return v && typeof v === 'object' ? v as Record<string, string[]> : {}
}
// The sections this person may see.
export async function overviewAllowed(roles: string[]): Promise<Set<string>> {
  const cfg = await overviewVisibility()
  if (roles.includes('admin')) return new Set(OVERVIEW_SECTIONS.map((s) => s.key))
  return new Set(OVERVIEW_SECTIONS.filter((s) => !cfg[s.key] || cfg[s.key]!.some((r) => roles.includes(r))).map((s) => s.key))
}
export async function assertOverviewTab(roles: string[], key: string): Promise<void> {
  if (!(await overviewAllowed(roles)).has(key)) throw apiError('forbidden', 'Your admin has not shared this with your role.', 403)
}
