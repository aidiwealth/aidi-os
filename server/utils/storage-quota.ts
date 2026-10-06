// Storage limits: plan GB + active add-ons + extra granted by Finvry. Null limit = unlimited.
export const STORAGE_PACK = { gb: 10, usd: 5, ngn: 5000 }
export interface StorageAddon { id: string; gb: number; expires_at: string; auto_renew: boolean; status: string }
export interface StorageInfo { used: number; limit_gb: number | null; plan_gb: number | null; addon_gb: number; extra_gb: number; addons: StorageAddon[] }
export async function storageOf(orgId: string): Promise<StorageInfo> {
  return asPlatform(async () => {
    const r = (await db().query<{ used: string; plan_gb: number | null; extra: string | null }>("SELECT (SELECT coalesce(sum(size_bytes), 0) FROM core.documents d WHERE d.organization_id = o.id)::text AS used, p.storage_gb AS plan_gb, o.settings->>'extra_storage_gb' AS extra FROM core.organizations o LEFT JOIN core.plans p ON p.code = o.plan_code WHERE o.id = $1", [orgId])).rows[0]
    const addons = (await db().query<{ id: string; gb: number; expires_at: string; auto_renew: boolean; status: string }>("SELECT id, gb, expires_at, auto_renew, status FROM core.storage_addons WHERE organization_id = $1 AND status = 'active' ORDER BY expires_at", [orgId])).rows
    const addon_gb = addons.filter((a) => new Date(a.expires_at) > new Date()).reduce((s, a) => s + a.gb, 0), extra_gb = Number(r?.extra ?? 0) || 0
    const plan_gb = r?.plan_gb ?? null
    return { used: Number(r?.used ?? 0), plan_gb, addon_gb, extra_gb, addons, limit_gb: plan_gb == null ? null : plan_gb + addon_gb + extra_gb }
  })
}
// Called before every upload: refuse when the workspace would go over its limit.
export async function assertStorage(bytes: number): Promise<void> {
  const org = currentOrgId()
  if (!org) return
  const s = await storageOf(org)
  if (s.limit_gb == null) return
  if (s.used + bytes > s.limit_gb * 1024 ** 3) throw apiError('storage_full', 'Your storage is full (' + (s.used / 1024 ** 3).toFixed(2) + ' of ' + s.limit_gb + ' GB). Add storage in Settings, or delete files you no longer need.', 402)
}
