// What can be deleted, by whom, what blocks it, and what owned detail goes with it.
export interface RecordType {
  table: string; module: string; roles: string[]; name: string
  blockers?: [string, string][]   // [count query with $1, label]
  children?: string[]             // owned rows deleted first ($1 = id)
  guard?: { sql: string; message: string } // a query returning a row when deletion is not allowed
  storage?: boolean               // also remove the stored file
}
const VC = ['admin', 'gp']
export const RECORDS: Record<string, RecordType> = {
  entity: { table: 'core.entities', module: 'entities', roles: ['admin'], name: 'name', blockers: [
    ['SELECT count(*) FROM banking.accounts WHERE entity_id = $1', 'bank account'], ['SELECT count(*) FROM core.documents WHERE entity_id = $1', 'document'],
    ['SELECT count(*) FROM compliance.obligations WHERE entity_id = $1', 'compliance obligation'], ['SELECT count(*) FROM governance.parties WHERE entity_id = $1', 'person on the register'],
    ['SELECT count(*) FROM governance.resolutions WHERE entity_id = $1', 'resolution'], ['SELECT count(*) FROM credit.loans WHERE lender_entity_id = $1', 'loan'],
    ['SELECT count(*) FROM deals.deals WHERE vehicle_entity_id = $1', 'deal'], ['SELECT count(*) FROM portfolio.companies WHERE holding_entity_id = $1', 'portfolio company'],
    ['SELECT count(*) FROM services.jobs WHERE provider_entity_id = $1', 'client job'], ['SELECT count(*) FROM core.entities WHERE parent_id = $1', 'owned entity'],
    ['SELECT count(*) FROM funds.funds WHERE entity_id = $1', 'fund set-up']] },
  vehicle: { table: 'core.entities', module: 'pipeline', roles: ['admin', 'gp'], name: 'name', blockers: [
    ["SELECT count(*) FROM core.entities WHERE id = $1 AND kind NOT IN ('fund','spv')", 'non-fund entity (delete it under Entities)'],
    ['SELECT count(*) FROM deals.deals WHERE vehicle_entity_id = $1', 'deal'], ['SELECT count(*) FROM portfolio.companies WHERE holding_entity_id = $1', 'portfolio company'],
    ['SELECT count(*) FROM funds.funds WHERE entity_id = $1', 'fund set-up (remove its LPs and the fund first)'], ['SELECT count(*) FROM credit.loans WHERE lender_entity_id = $1', 'loan'],
    ['SELECT count(*) FROM core.documents WHERE entity_id = $1', 'document']] },
  statement: { table: 'financials.statements', module: 'financials', roles: ['admin', 'gp'], name: "to_char(period_end, 'YYYY-MM-DD') || ' statement'" },
  fin_share: { table: 'financials.shares', module: 'financials', roles: ['admin', 'gp'], name: 'title' },
  update: { table: 'financials.updates', module: 'updates', roles: ['admin', 'gp'], name: 'title' },
  investor: { table: 'financials.investors', module: 'updates', roles: ['admin', 'gp'], name: 'name' },
  dr_file: { table: 'fundraise.files', module: 'fundraising', roles: ['admin', 'gp'], name: 'title' },
  dr_link: { table: 'fundraise.links', module: 'fundraising', roles: ['admin', 'gp'], name: 'name' },
  round_investor: { table: 'fundraise.round_investors', module: 'fundraising', roles: ['admin', 'gp'], name: 'name' },
  memo: { table: 'fundraise.memos', module: 'fundraising', roles: ['admin', 'gp'], name: 'title' },
  safe: { table: 'fundraise.safes', module: 'fundraising', roles: ['admin', 'gp'], name: 'investor_name' },
  crm_contact: { table: 'crm.contacts', module: 'contacts', roles: ['admin', 'gp', 'team'], name: 'name' },
  crm_list: { table: 'crm.lists', module: 'contacts', roles: ['admin', 'gp', 'team'], name: 'name' },
  crm_deal: { table: 'crm.deals', module: 'fundraising', roles: ['admin', 'gp', 'team'], name: 'investor' },
  crm_pipeline: { table: 'crm.pipelines', module: 'fundraising', roles: ['admin', 'gp'], name: 'name' },
  crm_note: { table: 'crm.notes', module: 'contacts', roles: ['admin', 'gp', 'team'], name: 'body' },
  nda_sig: { table: 'fundraise.nda_signatures', module: 'fundraising', roles: ['admin', 'gp'], name: 'name' },
  crm_meeting: { table: 'crm.meetings', module: 'fundraising', roles: ['admin', 'gp', 'team'], name: 'title' },
  document: { table: 'core.documents', module: 'documents', roles: ['admin'], name: 'title', storage: true, blockers: [
    ['SELECT count(*) FROM deals.deal_events WHERE document_id = $1', 'deal note'], ['SELECT count(*) FROM services.job_events WHERE document_id = $1', 'client job update']] },
  obligation: { table: 'compliance.obligations', module: 'compliance', roles: ['admin'], name: 'title', children: ['DELETE FROM compliance.completions WHERE obligation_id = $1'] },
  bank_account: { table: 'banking.accounts', module: 'banking', roles: ['admin'], name: "bank_name || ' · ' || account_name",
    children: ['DELETE FROM banking.transactions WHERE account_id = $1', 'DELETE FROM banking.imports WHERE account_id = $1', 'DELETE FROM banking.statements WHERE account_id = $1'] },
  resolution: { table: 'governance.resolutions', module: 'governance', roles: ['admin'], name: 'title', children: ['DELETE FROM governance.approvals WHERE resolution_id = $1'],
    guard: { sql: "SELECT 1 FROM governance.resolutions WHERE id = $1 AND status IN ('circulating','approved')", message: 'Circulating and approved resolutions are kept as a record. Withdraw it first if it is still circulating.' } },
  party: { table: 'governance.parties', module: 'governance', roles: ['admin'], name: 'name', blockers: [
    ['SELECT count(*) FROM governance.approvals WHERE party_id = $1', 'signature'], ['SELECT count(*) FROM governance.resolutions WHERE beneficiary_id = $1', 'resolution']] },
  borrower: { table: 'credit.borrowers', module: 'credit', roles: VC, name: 'name', blockers: [['SELECT count(*) FROM credit.loans WHERE borrower_id = $1', 'loan']] },
  loan: { table: 'credit.loans', module: 'credit', roles: VC, name: "coalesce(reference, 'loan')", children: [
    'DELETE FROM credit.covenant_checks WHERE covenant_id IN (SELECT id FROM credit.covenants WHERE loan_id = $1)', 'DELETE FROM credit.covenants WHERE loan_id = $1',
    'DELETE FROM credit.repayments WHERE loan_id = $1', 'DELETE FROM credit.schedule WHERE loan_id = $1'] },
  client: { table: 'services.clients', module: 'services', roles: ['admin'], name: 'name', blockers: [['SELECT count(*) FROM services.jobs WHERE client_id = $1', 'client job'], ['SELECT count(*) FROM services.invoices WHERE client_id = $1', 'invoice']],
    children: ['DELETE FROM services.people WHERE client_id = $1', 'DELETE FROM services.companies WHERE client_id = $1'] },
  cs_company: { table: 'services.companies', module: 'services', roles: ['admin'], name: 'name', blockers: [['SELECT count(*) FROM services.invoices WHERE company_id = $1', 'invoice']] },
  cs_person: { table: 'services.people', module: 'services', roles: ['admin'], name: 'name' },
  cs_invoice: { table: 'services.invoices', module: 'services', roles: ['admin'], name: "'invoice ' || number", children: ['DELETE FROM services.invoice_payments WHERE invoice_id = $1'],
    guard: { sql: "SELECT 1 FROM services.invoices WHERE id = $1 AND status IN ('sent','paid')", message: 'Sent and paid invoices are kept as a record. Void it instead.' } },
  info_request: { table: 'services.info_requests', module: 'services', roles: ['admin'], name: "tax_year || ' tax information request'" },
  catalog: { table: 'services.catalog', module: 'services', roles: ['admin'], name: 'name' },
  job: { table: 'services.jobs', module: 'services', roles: ['admin'], name: 'title', children: ['DELETE FROM services.job_events WHERE job_id = $1'] },
  company: { table: 'portfolio.companies', module: 'portfolio', roles: VC, name: 'name', children: [
    'DELETE FROM portfolio.metric_values WHERE company_id = $1', 'DELETE FROM portfolio.updates WHERE company_id = $1', 'DELETE FROM portfolio.requests WHERE company_id = $1'] },
  deal: { table: 'deals.deals', module: 'pipeline', roles: VC, name: 'company', blockers: [['SELECT count(*) FROM portfolio.companies WHERE deal_id = $1', 'portfolio company']],
    children: ['DELETE FROM deals.deal_events WHERE deal_id = $1', 'DELETE FROM deals.ic_votes WHERE deal_id = $1'] },
  pitch: { table: 'deals.pitches', module: 'pitches', roles: VC, name: 'company', blockers: [['SELECT count(*) FROM deals.deals WHERE pitch_id = $1', 'deal in the pipeline']],
    children: ['DELETE FROM deals.screenings WHERE pitch_id = $1', 'DELETE FROM deals.decisions WHERE pitch_id = $1'] },
  lp: { table: 'funds.lps', module: 'funds', roles: VC, name: 'name', blockers: [['SELECT count(*) FROM funds.commitments WHERE lp_id = $1', 'fund commitment']] },
  commitment: { table: 'funds.commitments', module: 'funds', roles: VC, name: "'commitment'",
    guard: { sql: "SELECT 1 FROM funds.commitments m JOIN funds.calls c ON c.fund_id = m.fund_id JOIN funds.call_lines l ON l.call_id = c.id AND l.lp_id = m.lp_id WHERE m.id = $1 AND c.status <> 'cancelled'", message: 'This LP is part of a capital call or distribution, so the commitment stays. Change its amount instead.' } },
  fund_call: { table: 'funds.calls', module: 'funds', roles: VC, name: "CASE kind WHEN 'call' THEN 'Capital call ' ELSE 'Distribution ' END || number",
    guard: { sql: "SELECT 1 FROM funds.calls WHERE id = $1 AND status IN ('approved','sent','completed')", message: 'Approved and sent calls are kept as a record. Cancel it instead if it has not been sent.' },
    children: ['DELETE FROM funds.call_approvals WHERE call_id = $1', 'DELETE FROM funds.call_lines WHERE call_id = $1'] },
  nav: { table: 'funds.navs', module: 'funds', roles: VC, name: "'NAV ' || to_char(as_of, 'YYYY-MM-DD')" }
}
