// Modules: features an admin can switch off. Each belongs to a group and is limited to roles.
// When a module is off, its sidebar link disappears and its pages and APIs return "not found".
import type { H3Event } from 'h3'

export interface ModuleDef { code: string; group: 'vc' | 'fin' | 'fo' | 'cs' | 'admin'; label: string; to: string; roles: string[]; api: string[]; pages: string[]; switchable: boolean }
export const MODULES: ModuleDef[] = [
  { code: 'pitches', group: 'vc', label: 'Pitches', to: '/deals', roles: ['gp', 'team'], api: ['/api/deals', '/api/public/pitch'], pages: ['/deals'], switchable: true },
  { code: 'pipeline', group: 'vc', label: 'Pipeline', to: '/pipeline', roles: ['gp', 'team'], api: ['/api/pipeline'], pages: ['/pipeline'], switchable: true },
  { code: 'portfolio', group: 'vc', label: 'Portfolio', to: '/portfolio', roles: ['gp', 'team'], api: ['/api/portfolio', '/api/public/report'], pages: ['/portfolio', '/report'], switchable: true },
  { code: 'funds', group: 'vc', label: 'Funds & LPs', to: '/funds', roles: ['gp', 'team'], api: ['/api/funds'], pages: ['/funds'], switchable: true },
  { code: 'directory', group: 'vc', label: 'Fund services', to: '/directory', roles: ['gp', 'team', 'family', 'adviser'], api: ['/api/directory'], pages: ['/directory'], switchable: false },
  { code: 'credit', group: 'vc', label: 'Credit', to: '/credit', roles: ['gp', 'team'], api: ['/api/credit', '/api/public/cron/credit'], pages: ['/credit'], switchable: true },
  { code: 'analytics', group: 'vc', label: 'Analytics', to: '/analytics', roles: ['gp', 'team', 'family'], api: ['/api/analytics'], pages: ['/analytics'], switchable: true },
  { code: 'financials', group: 'fin', label: 'Financials', to: '/financials', roles: ['gp', 'team', 'family'], api: ['/api/financials'], pages: ['/financials'], switchable: true },
  { code: 'fundraising', group: 'fin', label: 'Fundraising', to: '/fundraising', roles: ['gp', 'team'], api: ['/api/fundraising'], pages: ['/fundraising'], switchable: true },
  { code: 'updates', group: 'fin', label: 'Investor updates', to: '/updates', roles: ['gp', 'team'], api: ['/api/updates', '/api/investors'], pages: ['/updates'], switchable: true },
  { code: 'investor_page', group: 'fin', label: 'Investor page', to: '/investor-page', roles: ['gp', 'team'], api: ['/api/investor-page'], pages: ['/investor-page'], switchable: true },
  { code: 'wallet', group: 'fo', label: 'Wallet', to: '/wallet', roles: ['admin', 'gp', 'team', 'family'], api: ['/api/wallet'], pages: ['/wallet'], switchable: true },
  { code: 'company_services', group: 'fo', label: 'Services', to: '/client', roles: ['admin', 'gp', 'team', 'family'], api: ['/api/portal'], pages: ['/client'], switchable: true },
  { code: 'entities', group: 'fo', label: 'Entities', to: '/entities', roles: ['gp', 'team', 'family'], api: ['/api/entities/'], pages: ['/entities'], switchable: true },
  { code: 'documents', group: 'fo', label: 'Documents', to: '/documents', roles: ['gp', 'team', 'family'], api: ['/api/documents'], pages: ['/documents'], switchable: true },
  { code: 'compliance', group: 'fo', label: 'Compliance', to: '/compliance', roles: ['gp', 'team', 'family'], api: ['/api/compliance', '/api/public/cron/compliance'], pages: ['/compliance'], switchable: true },
  { code: 'governance', group: 'fo', label: 'Trusts & governance', to: '/governance', roles: ['family', 'gp'], api: ['/api/governance'], pages: ['/governance'], switchable: true },
  { code: 'banking', group: 'fo', label: 'Bank & cash', to: '/banking', roles: ['gp', 'family'], api: ['/api/banking'], pages: ['/banking'], switchable: true },
  { code: 'fo_analytics', group: 'fo', label: 'Analytics', to: '/family-office/analytics', roles: ['gp', 'team', 'family'], api: ['/api/fo-analytics'], pages: ['/family-office'], switchable: true },
  { code: 'services', group: 'cs', label: 'Jobs', to: '/services', roles: ['team', 'gp', 'services'], api: ['/api/services', '/api/public/job'], pages: ['/services', '/job'], switchable: true },
  { code: 'cs_analytics', group: 'cs', label: 'Analytics', to: '/client-services/analytics', roles: ['team', 'gp', 'services'], api: ['/api/cs-analytics'], pages: ['/client-services'], switchable: true },
  { code: 'team', group: 'admin', label: 'Team', to: '/team', roles: ['admin'], api: ['/api/admin/users'], pages: ['/team'], switchable: false },
  { code: 'modules', group: 'admin', label: 'Modules', to: '/modules', roles: ['admin'], api: ['/api/admin/modules'], pages: ['/modules'], switchable: false },
  { code: 'settings', group: 'admin', label: 'Settings', to: '/settings', roles: ['admin'], api: ['/api/settings'], pages: ['/settings'], switchable: false }
]
export const GROUP_LABEL: Record<ModuleDef['group'], string> = { vc: 'Venture Capital', fin: 'Financials', fo: 'Family Office', cs: 'Client Services', admin: 'Administration' }

// Per workspace: modules in its plan, minus any an admin switched off. Cached for 30 seconds.
const cache = new Map<string, { at: number; on: Set<string>; plan: Set<string> }>()
async function load(): Promise<{ on: Set<string>; plan: Set<string> }> {
  const org = currentOrgId(), key = org ?? '-'
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 30_000) return hit
  let plan = new Set<string>(), off = new Set<string>()
  if (org) {
    const p = await db().query<{ modules: string[] }>('SELECT p.modules FROM core.organizations o JOIN core.plans p ON p.code = o.plan_code WHERE o.id = core.current_org()')
    plan = new Set(p.rows[0]?.modules ?? [])
    const r = await db().query<{ code: string; enabled: boolean }>('SELECT code, enabled FROM core.modules')
    off = new Set(r.rows.filter((m) => !m.enabled).map((m) => m.code))
  }
  const on = new Set(MODULES.filter((m) => !m.switchable || (plan.has(m.code) && !off.has(m.code))).map((m) => m.code))
  const v = { at: Date.now(), on, plan }
  cache.set(key, v)
  return v
}
export async function enabledModules(): Promise<Set<string>> { return (await load()).on }
export async function planModules(): Promise<Set<string>> { return (await load()).plan }
export const clearModuleCache = (): void => { cache.clear() }
export const moduleForApi = (path: string): ModuleDef | undefined => MODULES.find((m) => m.api.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/')))
export const canUse = (m: ModuleDef, roles: string[]): boolean => roles.includes('admin') || m.roles.some((r) => roles.includes(r))

export async function requireModule(event: H3Event, code: string): Promise<void> {
  if (!(await enabledModules()).has(code)) throw apiError('module_off', 'This module is switched off.', 404)
}
