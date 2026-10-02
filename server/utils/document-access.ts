// Who may see a document, by sensitivity. Enforced on every list, upload and download.
export type Sensitivity = 'normal' | 'family' | 'restricted'
const RULES: Record<Sensitivity, string[]> = {
  normal: ['admin', 'gp', 'team', 'family'],
  family: ['admin', 'family'],
  restricted: ['admin']
}
export const canSee = (roles: string[], s: Sensitivity): boolean => RULES[s].some((r) => roles.includes(r))
export const visibleLevels = (roles: string[]): Sensitivity[] => (Object.keys(RULES) as Sensitivity[]).filter((s) => canSee(roles, s))
