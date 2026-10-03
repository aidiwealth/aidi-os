// Step 2: confirm the period and balances. The server re-checks the tie-out against the transactions it read; only then is it saved.
import { z } from 'zod'
const Body = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  opening: z.number().finite(), closing: z.number().finite()
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'family')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Enter the statement dates and the opening and closing balances.')
  const imp = await db().query<{ account_id: string; document_id: string | null; source: 'csv' | 'pdf'; parsed: ParsedStatement; status: string; created_by: string; entity_id: string }>(
    'SELECT i.account_id, i.document_id, i.source, i.parsed, i.status, i.created_by, a.entity_id FROM banking.imports i JOIN banking.accounts a ON a.id = i.account_id WHERE i.id = $1', [id.data])
  const row = imp.rows[0]
  if (!row) throw apiError('not_found', 'Import not found', 404)
  if (row.status !== 'pending') throw apiError('done', 'This statement has already been saved.')
  const { period_start, period_end, opening, closing } = b.data
  if (period_end < period_start) throw apiError('invalid', 'The end date is before the start date.')
  const txns = row.parsed.txns.filter((t) => t.date >= period_start && t.date <= period_end)
  if (txns.length !== row.parsed.txns.length) throw apiError('outside', (row.parsed.txns.length - txns.length) + ' transaction(s) fall outside those dates. Check the period.')
  const tie = tieOut(opening, closing, txns)
  if (!tie.ok) throw apiError('no_tie', 'This statement does not tie out: opening ' + opening.toFixed(2) + ' + in ' + tie.credits.toFixed(2) + ' − out ' + tie.debits.toFixed(2) + ' = ' + tie.expected.toFixed(2) + ', but the closing balance is ' + closing.toFixed(2) + ' (difference ' + tie.difference.toFixed(2) + '). Nothing was saved.', 422)
  const overlap = await db().query("SELECT 1 FROM banking.statements WHERE account_id = $1 AND period_start <= $3 AND period_end >= $2", [row.account_id, period_start, period_end])
  if (overlap.rowCount) throw apiError('overlap', 'A saved statement already covers part of this period.')
  const prev = await db().query<{ closing: string }>('SELECT closing_balance::text AS closing FROM banking.statements WHERE account_id = $1 AND period_end < $2 ORDER BY period_end DESC LIMIT 1', [row.account_id, period_start])
  const continuity = prev.rows[0] ? Math.abs(Number(prev.rows[0].closing) - opening) < 0.005 : null
  const client = await db().connect()
  let statementId: string
  try {
    await client.query('BEGIN')
    const s = await client.query<{ id: string }>(
      `INSERT INTO banking.statements (account_id, period_start, period_end, opening_balance, closing_balance, credits_total, debits_total, txn_count, continuity_ok, document_id, source, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [row.account_id, period_start, period_end, opening, closing, tie.credits, tie.debits, txns.length, continuity, row.document_id, row.source, user.userId])
    statementId = s.rows[0]!.id
    for (let i = 0; i < txns.length; i += 500) {
      const chunk = txns.slice(i, i + 500)
      const vals: unknown[] = []
      const ph = chunk.map((t, k) => { vals.push(statementId, row.account_id, t.date, t.description, t.amount, t.balance); const o = k * 6; return '($' + (o + 1) + ',$' + (o + 2) + ',$' + (o + 3) + ',$' + (o + 4) + ',$' + (o + 5) + ',$' + (o + 6) + ')' }).join(',')
      await client.query('INSERT INTO banking.transactions (statement_id, account_id, txn_date, description, amount, balance) VALUES ' + ph, vals)
    }
    await client.query("UPDATE banking.imports SET status = 'saved' WHERE id = $1", [id.data])
    await client.query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, entity_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user.userId, 'banking.statement_saved', 'bank_account', row.account_id, row.entity_id, JSON.stringify({ period_start, period_end, opening, closing, txns: txns.length, continuity }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  return { ok: true, statementId, continuity }
})
