// Founder: their raises (only when a Finvry admin has switched managed fundraising on).
export default defineEventHandler(async (event) => {
  const s = await readSession(event)
  const org = s?.orgId ? (await asPlatform(() => db().query<{ settings: Record<string, unknown> }>('SELECT settings FROM core.organizations WHERE id = $1', [s.orgId]))).rows[0] : undefined
  if (org?.settings.raise_enabled !== true) return { enabled: false }
  const u = await requirePortal(event)
  await db().query("DELETE FROM services.raise_programs WHERE client_id = $1 AND intake_at IS NULL AND status = 'intake' AND NOT EXISTS (SELECT 1 FROM services.raise_investors i WHERE i.program_id = raise_programs.id)", [u.clientId])
  const ids = (await db().query<{ id: string }>('SELECT id FROM services.raise_programs WHERE client_id = $1 ORDER BY created_at DESC', [u.clientId])).rows
  const programs = []
  for (const r of ids) { const v = await raiseView(r.id, true); if (v) programs.push(v) }
  return { enabled: true, fee_pct: Number(org.settings.raise_fee_pct ?? 4), programs, labels: RAISE_STATUS }
})
