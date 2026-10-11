// What the wealth invoice form needs: clients, contracting entities, the chosen client's defaults, and an invoice being edited.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const q = getQuery(event)
  const edit = typeof q.edit === 'string' && /^[0-9a-f-]{36}$/.test(q.edit) ? q.edit : null
  const inv = edit ? (await db().query<{ id: string; status: string; number: string | null; client_id: string; entity_id: string | null; currency: string; method: string | null; issue_date: string; due_date: string | null; lines: { description: string; quantity: number; unit_amount: number; kind?: string }[] | null; note: string | null; bill_to: Record<string, string> | null }>(
    "SELECT id, status, number, client_id, entity_id, currency, method, to_char(coalesce(issue_date, created_at::date), 'YYYY-MM-DD') AS issue_date, to_char(due_date, 'YYYY-MM-DD') AS due_date, lines, note, bill_to FROM wm.fees WHERE id = $1 AND kind = 'invoice'", [edit])).rows[0] ?? null : null
  const cid = inv?.client_id ?? (typeof q.client === 'string' && /^[0-9a-f-]{36}$/.test(q.client) ? q.client : null)
  const client = cid ? (await db().query<{ id: string; name: string; email: string | null; country: string | null; entity_id: string | null }>('SELECT id, name, email, country, entity_id FROM wm.clients WHERE id = $1', [cid])).rows[0] ?? null : null
  return {
    clients: (await db().query('SELECT id, name, country FROM wm.clients ORDER BY name')).rows,
    entities: (await db().query("SELECT id, name, address FROM core.entities WHERE status <> 'closed' ORDER BY name")).rows,
    client, invoice: inv ? { ...inv, lines: (inv.lines ?? []).filter((l) => l.kind !== 'tax') } : null
  }
})
