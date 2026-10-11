// Recurring services of a services client (virtual office, registered agent): the wallet renewal and the compliance
// calendar entry, shown together so the team can correct dates for an old order logged today.
const RECURRING = ['virtual_office', 'registered_agent']
export interface Renewal { code: string; name: string; sub: { id: string; interval: string; amount_minor: number; currency: string; status: string; next_charge_at: string; started_on: string | null } | null; obligation: { id: string; next_due: string; recurrence: string } | null }
export async function clientRenewals(clientId: string): Promise<{ workspace: boolean; items: Renewal[] }> {
  const ws = (await asPlatform(() => db().query<{ workspace_id: string | null }>('SELECT workspace_id FROM services.clients WHERE id = $1', [clientId]))).rows[0]?.workspace_id
  if (!ws) return { workspace: false, items: [] }
  const subs = (await asPlatform(() => db().query<{ id: string; code: string; name: string; interval: string; amount_minor: number; currency: string; status: string; next_charge_at: string; started_on: string | null }>(
    "SELECT id, code, name, interval, amount_minor::float AS amount_minor, currency, status, to_char(next_charge_at, 'YYYY-MM-DD') AS next_charge_at, to_char(started_on, 'YYYY-MM-DD') AS started_on FROM wallet.subscriptions WHERE organization_id = $1 AND kind = 'service' AND status <> 'cancelled' ORDER BY created_at", [ws]))).rows
  const obls = (await inCompany(clientId, async () => {
    const ent = await companyEntityId(); if (!ent) return []
    return (await db().query<{ id: string; title: string; next_due: string; recurrence: string }>("SELECT id, title, to_char(next_due, 'YYYY-MM-DD') AS next_due, recurrence FROM compliance.obligations WHERE entity_id = $1 AND active AND title = ANY($2)", [ent, RECURRING.map((c) => FILING[c]!.title)])).rows
  })) ?? []
  const codes = [...new Set([...subs.map((x) => x.code), ...RECURRING.filter((c) => obls.some((o) => o.title === FILING[c]!.title))])]
  return { workspace: true, items: codes.map((c) => { const sub = subs.find((x) => x.code === c) ?? null; const o = FILING[c] ? obls.find((x) => x.title === FILING[c]!.title) ?? null : null
    return { code: c, name: sub?.name ?? FILING[c]?.title.replace(/ renewal$/, '') ?? c, sub: sub ? { id: sub.id, interval: sub.interval, amount_minor: sub.amount_minor, currency: sub.currency, status: sub.status, next_charge_at: sub.next_charge_at, started_on: sub.started_on } : null, obligation: o ? { id: o.id, next_due: o.next_due, recurrence: o.recurrence } : null } }) }
}
// Set when a recurring service started and/or its next renewal date; the wallet charge and the calendar move together.
export async function setRenewal(clientId: string, code: string, d: { started_on?: string; next_date?: string; status?: 'active' | 'suspended' | 'cancelled' }): Promise<{ next: string | null }> {
  const r = await clientRenewals(clientId)
  const it = r.items.find((x) => x.code === code)
  if (!it) throw apiError('not_found', 'That service is not set up for this client.', 404)
  const months = it.sub ? (it.sub.interval === 'month' ? 1 : 12) : it.obligation?.recurrence === 'monthly' ? 1 : 12
  const next = d.next_date ?? (d.started_on ? nextChargeFrom(d.started_on, months) : null)
  if (it.sub) await asPlatform(() => db().query('UPDATE wallet.subscriptions SET next_charge_at = coalesce($2::date, next_charge_at), started_on = coalesce($3::date, started_on), status = coalesce($4, status), reminded_for = NULL, updated_at = now() WHERE id = $1', [it.sub!.id, next, d.started_on ?? null, d.status ?? null]))
  if (it.obligation) await inCompany(clientId, async () => {
    if (d.status === 'cancelled') await db().query('UPDATE compliance.obligations SET active = false WHERE id = $1', [it.obligation!.id])
    else if (next) await db().query('UPDATE compliance.obligations SET next_due = $2 WHERE id = $1', [it.obligation!.id, next])
  })
  return { next }
}
