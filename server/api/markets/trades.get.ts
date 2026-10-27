// Trades across accounts: proposals waiting for approval, tickets to place, fills to confirm (each with what confirming
// will write) and recent history.
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  await db().query("UPDATE markets.proposals SET status = 'expired' WHERE status = 'waiting' AND expires_at < now()")
  const proposals = (await db().query<Record<string, any>>(`SELECT p.id, p.account_id, a.name AS account, a.broker, a.broker_label, a.execution, a.owner_type, p.symbol, i.name, i.kind, p.side, p.qty::float, p.limit_price::float, p.notional::float, p.reason, p.checks, p.status,
      p.created_at, p.expires_at, p.decided_at, pd.full_name AS decided_by, v.version AS valuation_version
    FROM markets.proposals p JOIN markets.accounts a ON a.id = p.account_id JOIN markets.instruments i ON i.symbol = p.symbol
    LEFT JOIN core.users u ON u.id = p.decided_by LEFT JOIN core.people pd ON pd.id = u.person_id LEFT JOIN markets.valuations v ON v.id = p.valuation_id
   WHERE p.status IN ('waiting', 'ticket') OR p.created_at > now() - interval '30 days' ORDER BY p.created_at DESC LIMIT 200`)).rows
  const fills = (await db().query<Record<string, any>>(`SELECT f.id, f.account_id, a.name AS account, a.broker, a.broker_label, f.proposal_id, f.symbol, i.name, f.side, f.qty::float, f.price::float, f.fees::float, f.filled_at, f.source, f.status, f.effects, f.note, f.created_at,
      pe.full_name AS entered_by, pd.full_name AS decided_by, f.decided_at
    FROM markets.fills f JOIN markets.accounts a ON a.id = f.account_id JOIN markets.instruments i ON i.symbol = f.symbol
    LEFT JOIN core.users ue ON ue.id = f.entered_by LEFT JOIN core.people pe ON pe.id = ue.person_id LEFT JOIN core.users ud ON ud.id = f.decided_by LEFT JOIN core.people pd ON pd.id = ud.person_id
   WHERE f.status = 'pending' OR f.created_at > now() - interval '60 days' ORDER BY f.created_at DESC LIMIT 200`)).rows
  for (const f of fills) if (f.status === 'pending') { try { f.preview = await previewFill(f as any) } catch (e) { f.preview_error = (e as Error).message } }
  return { proposals: proposals.map((p) => ({ ...p, broker_name: brokerName(p as any) })), fills: fills.map((f) => ({ ...f, broker_name: brokerName(f as any) })), code_method: (await hasAuthenticator(user.userId)) ? 'app' : 'email' }
})
