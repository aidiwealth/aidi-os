// Connected bank accounts are US accounts only (the bank connection works with US banks). A company with accounts
// elsewhere (a Nigerian operating company, subsidiaries abroad) has more cash than the connection shows, so live
// balances are only part of the picture: compared here with the cash in Financials (the group's, converted, when the
// company has subsidiaries or said it is a group), and treated as partial when they cover clearly less.
export interface Coverage { reported: number | null; as_of: string | null; share: number | null; partial: boolean; group: boolean; structure: 'single' | 'group' | null }
export async function bankCoverage(bankCash: number, currency: string): Promise<Coverage | null> {
  const org = await currentOrg()
  if (org?.kind !== 'company') return null
  const structure = (org.settings.structure as 'single' | 'group' | undefined) ?? null
  const ents = (await db().query<{ id: string; main: boolean }>("SELECT id, parent_id IS NULL AS main FROM core.entities WHERE kind = 'operating' AND status <> 'closed'")).rows
  const group = ents.length > 1
  const subject = group ? 'group' : 'entity:' + (await companyEntityId())
  const today = new Date().toISOString().slice(0, 10)
  const rows = (await loadStatements(subject, 'month', currency).catch(() => [])).filter((r) => r.period_end <= today && typeof r.lines.cash === 'number')
  const last = rows[rows.length - 1]
  const reported = last ? Number(last.lines.cash) : null
  const share = reported && reported > 0 ? Math.round((bankCash / reported) * 1000) / 1000 : null
  // Partial: the company is a group, or Financials show clearly more cash than the connected accounts hold.
  const partial = structure === 'group' || group || (reported !== null && reported > bankCash * 1.2 + 1000)
  return { reported: reported === null ? null : Math.round(reported), as_of: last?.period_end ?? null, share, partial, group: group || structure === 'group', structure }
}
