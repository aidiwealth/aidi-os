// Finance room: wallet float, top-ups, debits and credits across workspaces, and the ledger (filtered).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const q = z.object({ kind: z.enum(['all', 'credit', 'debit']).default('all'), category: z.string().max(30).default('all'), currency: z.enum(['all', 'USD', 'NGN']).default('all'), org: z.string().max(40).default('') }).parse(getQuery(event))
  return asPlatform(async () => {
    const totals = await db().query(`SELECT c.currency,
        (SELECT coalesce(sum(balance_minor), 0)::float FROM wallet.wallets w WHERE w.currency = c.currency) AS float_minor,
        (SELECT coalesce(sum(amount_minor), 0)::float FROM wallet.ledger l WHERE l.currency = c.currency AND l.category = 'topup' AND l.created_at >= date_trunc('month', now())) AS topups_minor,
        (SELECT coalesce(sum(amount_minor), 0)::float FROM wallet.ledger l WHERE l.currency = c.currency AND l.kind = 'debit' AND l.created_at >= date_trunc('month', now())) AS debits_minor,
        (SELECT coalesce(sum(amount_minor), 0)::float FROM wallet.ledger l WHERE l.currency = c.currency AND l.category = 'admin_credit' AND l.created_at >= date_trunc('month', now())) AS credits_minor
      FROM (VALUES ('USD'), ('NGN')) AS c(currency)`)
    const where: string[] = [], args: unknown[] = []
    if (q.kind !== 'all') { args.push(q.kind); where.push('l.kind = $' + args.length) }
    if (q.category !== 'all') { args.push(q.category); where.push('l.category = $' + args.length) }
    if (q.currency !== 'all') { args.push(q.currency); where.push('l.currency = $' + args.length) }
    if (/^[0-9a-f-]{36}$/.test(q.org)) { args.push(q.org); where.push('l.organization_id = $' + args.length) }
    const ledger = await db().query(`SELECT l.id, l.created_at, o.name AS workspace, l.organization_id, l.kind, l.category, l.reason, l.currency, l.amount_minor::float AS amount_minor, l.balance_after_minor::float AS balance_after_minor, p.full_name AS by
      FROM wallet.ledger l JOIN core.organizations o ON o.id = l.organization_id LEFT JOIN core.users u ON u.id = l.created_by LEFT JOIN core.people p ON p.id = u.person_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.created_at DESC LIMIT 300`, args)
    const workspaces = await db().query(`SELECT o.id, o.name, coalesce(w.currency, CASE WHEN o.settings->>'currency' = 'NGN' THEN 'NGN' ELSE 'USD' END) AS currency, coalesce(w.balance_minor, 0)::float AS balance_minor
      FROM core.organizations o LEFT JOIN wallet.wallets w ON w.organization_id = o.id WHERE o.kind = 'company' AND o.status <> 'closed' ORDER BY o.name`)
    return { totals: totals.rows, ledger: ledger.rows, workspaces: workspaces.rows }
  })
})
