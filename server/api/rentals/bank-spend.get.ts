// Payments out of Aidi Haven's bank accounts (from uploaded statements) not yet logged as a rental expense, with a
// suggested category — e.g. the cleaner paid from Chase. One click logs it; or mark it "not a rental cost".
const GUESS: [RegExp, string][] = [[/clean|maid|laundr|linen|housekeep|turnover/i, 'cleaning'], [/pg&?e|pge|electric|edison|water|sewer|garbage|recology|comcast|xfinity|at&t|verizon|internet|gas co|sjwater/i, 'utilities'],
  [/home ?depot|lowe'?s|plumb|handyman|repair|hvac|roof|pest|locksmith|ace hardware/i, 'repairs'], [/ikea|wayfair|best ?buy|furniture|mattress|appliance/i, 'furniture'], [/costco|target|walmart|amazon|safeway|supplies|bed bath/i, 'supplies'],
  [/insurance|mortgage|property tax|county|permit|city of|hoa|rent\b/i, 'rent_fees']]
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const ent = await havenEntityId()
  const rows = (await db().query<{ id: string; txn_date: string; description: string; amount: number; account: string }>(`SELECT b.id, to_char(b.txn_date, 'YYYY-MM-DD') AS txn_date, b.description, -b.amount::float AS amount, a.bank_name || ' ····' || coalesce(a.last4, '') AS account
      FROM banking.transactions b JOIN banking.accounts a ON a.id = b.account_id
     WHERE b.amount < 0 AND ($1::uuid IS NULL OR a.entity_id = $1) AND b.txn_date > current_date - 400
       AND NOT EXISTS (SELECT 1 FROM rentals.expenses e WHERE e.bank_txn_id = b.id) AND NOT EXISTS (SELECT 1 FROM rentals.bank_ignored i WHERE i.bank_txn_id = b.id)
     ORDER BY b.txn_date DESC LIMIT 100`, [ent])).rows
  return { rows: rows.map((r) => ({ ...r, guess: GUESS.find(([re]) => re.test(r.description))?.[1] ?? null })), has_accounts: !!(await db().query('SELECT 1 FROM banking.accounts a WHERE $1::uuid IS NULL OR a.entity_id = $1 LIMIT 1', [ent])).rowCount }
})
