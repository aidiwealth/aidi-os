// Client: their managed fundraising program (only when a Finvry admin has switched it on).
export default defineEventHandler(async (event) => {
  const s = await readSession(event)
  const org = s?.orgId ? (await asPlatform(() => db().query<{ settings: Record<string, unknown> }>('SELECT settings FROM core.organizations WHERE id = $1', [s.orgId]))).rows[0] : undefined
  if (org?.settings.raise_enabled !== true) return { enabled: false }
  const u = await requirePortal(event)
  let p = (await db().query<{ id: string }>('SELECT id FROM services.raise_programs WHERE client_id = $1', [u.clientId])).rows[0]
  if (!p) p = await one<{ id: string }>('INSERT INTO services.raise_programs (client_id, workspace_id, fee_pct) VALUES ($1,$2,$3) RETURNING id', [u.clientId, s!.orgId, Number(org.settings.raise_fee_pct ?? 4)])
  const v = await raiseView(p.id, true)
  return { enabled: true, ...v, labels: RAISE_STATUS }
})
