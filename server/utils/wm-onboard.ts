// Aidi Wealth onboarding as one conversation. The client answers in their own words (the AI reads them into the plan)
// or with the quick answers under each question; either way the same checks apply. Steps: household, money in and
// out, what they own, debts and goals, the risk questions and level, then the account: in the US the investing
// account (opened with the brokerage partner; the Social Security number is held encrypted only until it opens), in
// Nigeria the BVN for the wallet. Invited clients finish straight into their dashboard; website requests wait for an
// adviser to approve. The brokerage is never named to the client.
import { z } from 'zod'
import { RISK_LEVELS, RISK_QUESTIONS, levelFromAnswers, levelLabel } from '~/shared/risk'
import { RISK_LIMITS } from '~/shared/trading'
import type { DocReadOut } from './wm-docread'
import { DATA_NOTICE_VERSION, dataDocs, dataNoticeMd, dataNoticeTitle, dataRecordMd, noticeEntity } from '~/shared/wm-data-notice'

export interface Widget {
  kind: 'form' | 'rows' | 'choice' | 'scale' | 'agree' | 'none'
  fields?: { key: string; label: string; type: 'text' | 'number' | 'date' | 'secret' | 'select'; options?: [string, string][]; placeholder?: string; value?: string | number }[]
  columns?: { key: string; label: string; type: 'text' | 'number' | 'date' | 'select'; options?: [string, string][]; placeholder?: string; suggest?: 'lender' }[]
  hint?: string
  quick?: { label: string; row: Record<string, unknown> }[]
  rows?: Record<string, unknown>[]
  options?: { value: string; label: string; note?: string }[]
  suggested?: string
  items?: { key: string; label: string; required: boolean; href?: string }[]
  submit?: string
  skip?: string
  upload?: string
}
export type Answers = Record<string, any>
interface Ctx { country: 'US' | 'NG'; account: boolean; first: string; source: 'invite' | 'request'; answers: Answers; clientId: string; onbId: string; contact: string | null; phone: string | null }
interface Step { id: string; phase: number; ai: boolean; ask: (c: Ctx) => string; widget: (c: Ctx) => Widget; apply: (v: any, c: Ctx) => Promise<{ me: string; ack: string }> | { me: string; ack: string } }

const cur = (c: Ctx) => (c.country === 'NG' ? 'NGN' : 'USD')
const CURS: [string, string][] = [['USD', 'USD'], ['NGN', 'NGN']]
const FREQ: [string, string][] = [['monthly', 'A month'], ['annual', 'A year']]
const money = (v: number, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Math.round(v))
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0 }
const str = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max)
const bad = (m: string) => { throw apiError('invalid', m) }
const monthly = (rows: any[] = [], c: string) => rows.filter((r) => (r.currency ?? c) === c).reduce((a, r) => a + num(r.amount) / (r.frequency === 'annual' ? 12 : 1), 0)
function rowsOf(v: any, keys: string[], need: string, c: Ctx): Record<string, any>[] {
  const rows = Array.isArray(v?.rows) ? v.rows : []
  return rows.slice(0, 20).map((r: any) => Object.fromEntries(keys.map((k) => [k, ['amount', 'value', 'balance', 'payment', 'target'].includes(k) ? (r[k] === '' || r[k] == null ? null : num(r[k])) : k === 'currency' ? (['USD', 'NGN'].includes(r[k]) ? r[k] : cur(c)) : k === 'frequency' ? (r[k] === 'annual' ? 'annual' : 'monthly') : str(r[k])]))).filter((r: any) => num(r[need]) > 0)
}
// The risk questions in plain words: what each one means, actual years for the time questions, money for the fall,
// and an example under each answer. The answers saved are the same five steps as before.
const RISK_WHY: Record<string, string> = {
  horizon: 'Think about what this money is for. Money you need soon should not swing much in value; money you won\'t touch for years can ride out the ups and downs.',
  drop: 'Prices go up and down. This is about what you would actually do on a bad year.',
  goal: '',
  income: 'Steady income means you are less likely to need to sell investments at a bad time.',
  experience: '',
}
function riskAsk(id: string, q: string, c: Ctx) {
  const big = c.country === 'NG' ? '₦10,000,000' : '$10,000', low = c.country === 'NG' ? '₦7,500,000' : '$7,500'
  const text = id === 'drop' ? 'Say you invest ' + big + ' and a year later it is worth ' + low + ' (down 25%). What would you do?' : q
  return text + (RISK_WHY[id] ? '\n\n' + RISK_WHY[id] : '')
}
function riskLabel(id: string, k: number, a: string) {
  if (id !== 'horizon') return a
  const y = new Date().getFullYear()
  return a + ' (' + ['before ' + (y + 2), (y + 2) + ' to ' + (y + 5), (y + 5) + ' to ' + (y + 10), (y + 10) + ' to ' + (y + 20), 'after ' + (y + 20)][k] + ')'
}
const RISK_NOTES: Record<string, string[]> = {
  horizon: ['e.g. a house deposit or school fees soon', 'e.g. a car, wedding or business in a few years', 'e.g. children\'s university', 'e.g. a home later, or financial freedom', 'e.g. retirement'],
  drop: ['Stop any more loss, even if it means locking in the fall', 'Take some off the table', 'Wait for it to recover', 'Buy a little more at the lower price', 'See it as a sale and buy a lot more'],
  goal: ['Keep what I have, even if it grows slowly', 'Regular payouts, like interest or dividends', 'Some growth, with limited ups and downs', 'Grow over time, accepting bigger swings', 'The most growth, accepting large swings'],
  income: ['Not earning at the moment', 'Changes month to month, e.g. freelance or business', 'Mostly steady', 'A steady salary or income', 'Steady income, and savings for 6+ months'],
  experience: ['This would be the first time', '1 or 2 investments like these', 'Several', 'I invest like this often', 'It\'s my work or a big part of my wealth'],
}
// Figures read from the client's uploaded documents, offered as the answer rows to check (never applied unseen).
const sug = (c: Ctx, k: 'incomes' | 'expenses' | 'assets' | 'debts'): Record<string, unknown>[] => (c.answers.suggest?.[k] ?? []) as Record<string, unknown>[]
const KINDS: [string, string][] = [['brokerage', 'Investment account'], ['retirement', 'Retirement plan'], ['bank', 'Bank account'], ['savings', 'Savings'], ['crypto', 'Crypto'], ['other', 'Gold, property or other']]
const FUNDING: [string, string][] = [['employment_income', 'Salary'], ['business_income', 'Business income'], ['savings', 'Savings'], ['investments', 'Investments'], ['inheritance', 'Inheritance'], ['family', 'Family']]
const DISCLOSE: [string, string][] = [['none', 'None of these'], ['finra', 'I work at a brokerage or an exchange'], ['control', 'I\'m a director or 10% owner of a public company'], ['pep', 'Someone holds a senior political role']]

const STEPS: Step[] = [
  { id: 'household', phase: 0, ai: true,
    ask: (c) => 'Hi ' + c.first + ', I\'m your Aidi Wealth assistant. I\'ll ask a few questions to build your financial plan, the same things an adviser would ask. Answer in your own words and I\'ll fill in the details, or use the quick answers under each question.\n\nFirst, who\'s in your household, and where do you live?',
    widget: (c) => ({ kind: 'form', fields: [{ key: 'adults', label: 'Adults', type: 'number', value: c.answers.household?.adults ?? 1 }, { key: 'children', label: 'Children', type: 'number', value: c.answers.household?.children ?? 0 }, { key: 'location', label: 'City and country', type: 'text', placeholder: c.country === 'NG' ? 'e.g. Lagos, Nigeria' : 'e.g. San Jose, US', value: c.answers.household?.location ?? '' }], submit: 'Continue' }),
    apply: (v, c) => { const adults = Math.round(num(v.adults)), children = Math.round(num(v.children)); if (adults < 1 || adults > 20 || children < 0 || children > 20) bad('Tell me how many adults and children are in the household.'); const location = str(v.location)
      c.answers.household = { adults, children, location }; const who = adults + ' adult' + (adults === 1 ? '' : 's') + (children ? ', ' + children + ' child' + (children === 1 ? '' : 'ren') : '')
      return { me: who + (location ? ' · ' + location : ''), ack: 'Got it: ' + who + (location ? ' in ' + location : '') + '.' } } },
  { id: 'income', phase: 1, ai: true,
    ask: () => 'What comes in, roughly? Salary, business income, rent, dividends: whatever applies. Monthly or yearly is fine.',
    widget: (c) => ({ kind: 'rows', columns: [{ key: 'source', label: 'Source', type: 'text', placeholder: 'e.g. Salary' }, { key: 'amount', label: 'Amount', type: 'number' }, { key: 'frequency', label: 'How often', type: 'select', options: FREQ }, { key: 'currency', label: 'Currency', type: 'select', options: CURS }],
      quick: ['Salary', 'Business', 'Rent', 'Dividends'].map((s) => ({ label: s, row: { source: s, amount: '', frequency: s === 'Dividends' ? 'annual' : 'monthly', currency: cur(c) } })), rows: c.answers.incomes ?? sug(c, 'incomes'), submit: 'Done', skip: 'No regular income', upload: 'payslip' }),
    apply: (v, c) => { if (v.skip) { c.answers.incomes = []; return { me: 'No regular income', ack: 'No regular income for now; that\'s fine.' } }
      const rows = rowsOf(v, ['source', 'amount', 'frequency', 'currency'], 'amount', c); if (!rows.length) bad('Add at least one amount, or choose "No regular income".')
      c.answers.incomes = rows.map((r) => ({ who: '', ...r })); const m = monthly(rows, cur(c))
      return { me: rows.map((r) => (r.source || 'Income') + ' ' + money(r.amount, r.currency) + (r.frequency === 'annual' ? ' a year' : ' a month')).join(', '), ack: 'So about **' + money(m, cur(c)) + ' a month** coming in.' } } },
  { id: 'spending', phase: 1, ai: true,
    ask: () => 'And what goes out each month? A rough total is fine, or the big ones: housing, living costs, children, travel.',
    widget: (c) => ({ kind: 'rows', columns: [{ key: 'category', label: 'What for', type: 'text', placeholder: 'e.g. Housing' }, { key: 'amount', label: 'Amount', type: 'number' }, { key: 'frequency', label: 'How often', type: 'select', options: FREQ }, { key: 'currency', label: 'Currency', type: 'select', options: CURS }],
      quick: ['Housing', 'Living costs', 'Children and school', 'Travel'].map((s) => ({ label: s, row: { category: s, amount: '', frequency: s === 'Travel' ? 'annual' : 'monthly', currency: cur(c) } })), rows: c.answers.expenses ?? sug(c, 'expenses'), submit: 'Done', skip: 'Skip for now', upload: 'bank_statement' }),
    apply: (v, c) => { if (v.skip) { c.answers.expenses = []; return { me: 'Skip for now', ack: 'No problem, we can add spending later.' } }
      const rows = rowsOf(v, ['category', 'amount', 'frequency', 'currency'], 'amount', c); if (!rows.length) bad('Add at least one amount, or skip for now.')
      c.answers.expenses = rows; const out = monthly(rows, cur(c)), inc = monthly(c.answers.incomes, cur(c)), kept = inc - out
      return { me: rows.map((r) => (r.category || 'Spending') + ' ' + money(r.amount, r.currency) + (r.frequency === 'annual' ? ' a year' : ' a month')).join(', '), ack: 'That\'s about **' + money(out, cur(c)) + ' a month** going out' + (inc > 0 ? (kept > 0 ? ', so you keep about ' + money(kept, cur(c)) + ' (' + Math.round((kept / inc) * 100) + '% of what comes in).' : ', a little more than comes in. We\'ll look at that in your plan.') : '.') } } },
  { id: 'assets', phase: 2, ai: true,
    ask: (c) => (sug(c, 'assets').length ? 'Here is what I read from your documents; check the figures and change anything that is off. Add anything else you own: retirement plans, cash in the bank, gold, property, crypto.' : 'Now what you already own: investment accounts, stock from your employer (RSUs, ESPP), retirement plans and pensions, cash in the bank, gold, property, crypto. Tell me roughly, or upload statements (PDF or Excel) and I\'ll read the figures for you.'),
    widget: (c) => ({ kind: 'rows', columns: [{ key: 'name', label: 'Where or what', type: 'text', placeholder: 'e.g. Robinhood' }, { key: 'kind', label: 'Type', type: 'select', options: KINDS }, { key: 'value', label: 'Value', type: 'number' }, { key: 'currency', label: 'Currency', type: 'select', options: CURS }],
      quick: KINDS.map(([k, l]) => ({ label: l, row: { name: '', kind: k, value: '', currency: cur(c) } })), rows: c.answers.assets ?? sug(c, 'assets'), submit: 'Done', skip: 'Nothing yet', upload: 'other' }),
    apply: (v, c) => { if (v.skip) { c.answers.assets = []; return { me: 'Nothing yet', ack: 'Starting from scratch is a fine place to be.' } }
      const rows = rowsOf(v, ['name', 'kind', 'value', 'currency'], 'value', c).map((r): Record<string, any> => ({ ...r, kind: KINDS.some(([k]) => k === r.kind) ? r.kind : 'other', name: r.name || (KINDS.find(([k]) => k === r.kind)?.[1] ?? 'Other') })); if (!rows.length) bad('Add at least one value, or choose "Nothing yet".')
      c.answers.assets = rows; const tot = rows.filter((r) => r.currency === cur(c)).reduce((a, r) => a + r.value, 0)
      return { me: rows.map((r) => r.name + ' ' + money(r.value, r.currency)).join(', '), ack: 'That\'s about **' + money(tot, cur(c)) + '** in all. Thanks.' } } },
  { id: 'debts', phase: 3, ai: true,
    ask: () => 'Any debts: a mortgage, loans or cards?',
    widget: (c) => ({ kind: 'rows', columns: [{ key: 'name', label: 'Debt', type: 'text', placeholder: 'e.g. Mortgage' }, { key: 'lender', label: 'Owed to', type: 'text', placeholder: c.country === 'NG' ? 'Bank, lender or school' : 'Bank, card company or servicer', suggest: 'lender' }, { key: 'balance', label: 'Still owed', type: 'number' }, { key: 'payment', label: 'Paid a month', type: 'number' }, { key: 'currency', label: 'Currency', type: 'select', options: CURS }],
      quick: ['Mortgage', 'Car loan', 'Student loan', 'Credit card'].map((s) => ({ label: s, row: { name: s, lender: '', balance: '', payment: '', currency: cur(c) } })), rows: c.answers.debts ?? sug(c, 'debts'), submit: 'Done', skip: 'No debts', upload: 'other', hint: 'Pick who it\'s owed to from the list, or type the name. It\'s only to tell your debts apart.' }),
    apply: (v, c) => { if (v.skip) { c.answers.debts = []; return { me: 'No debts', ack: 'No debts. Good.' } }
      const rows = rowsOf(v, ['name', 'lender', 'balance', 'payment', 'currency'], 'balance', c); if (!rows.length) bad('Add what is still owed, or choose "No debts".')
      c.answers.debts = rows.map((r) => ({ ...r, name: r.name || 'Debt', lender: String(r.lender ?? '').trim().slice(0, 120) })); const tot = rows.filter((r) => r.currency === cur(c)).reduce((a, r) => a + r.balance, 0)
      return { me: c.answers.debts.map((r: any) => r.name + ' ' + money(r.balance, r.currency)).join(', '), ack: 'Noted: about ' + money(tot, cur(c)) + ' owed in all.' } } },
  { id: 'goals', phase: 3, ai: true,
    ask: () => 'What are you working towards? Pick any, and add a target or a date if you have one.',
    widget: () => ({ kind: 'rows', columns: [{ key: 'name', label: 'Goal', type: 'text', placeholder: 'e.g. Retire at 55' }, { key: 'target', label: 'Target amount', type: 'number' }, { key: 'by', label: 'By', type: 'date' }],
      quick: ['Retire early', 'Buy a home', 'Children\'s education', 'Grow my wealth', 'Emergency fund'].map((s) => ({ label: s, row: { name: s, target: '', by: '' } })), submit: 'Done', skip: 'Not sure yet' }),
    apply: (v, c) => { if (v.skip) { c.answers.goals = []; return { me: 'Not sure yet', ack: 'That\'s fine; your plan will suggest some.' } }
      const rows = (Array.isArray(v?.rows) ? v.rows : []).slice(0, 10).map((r: any) => ({ name: str(r.name, 160), target: r.target === '' || r.target == null ? null : num(r.target), by: /^\d{4}-\d{2}-\d{2}$/.test(String(r.by ?? '')) ? r.by : '' })).filter((r: any) => r.name)
      if (!rows.length) bad('Pick a goal, or choose "Not sure yet".'); c.answers.goals = rows
      return { me: rows.map((r: any) => r.name).join(', '), ack: rows.length === 1 ? 'A clear goal. Good.' : rows.length + ' goals. We\'ll plan for each.' } } },
  ...RISK_QUESTIONS.map((q, i): Step => ({ id: 'risk_' + q.id, phase: 4, ai: true,
    ask: (c) => (i === 0 ? 'Next, how you feel about risk: five quick questions. There are no right answers.\n\n' : '') + riskAsk(q.id, q.q, c),
    widget: (c) => ({ kind: 'choice', options: q.a.map((a, k) => ({ value: String(k + 1), label: riskLabel(q.id, k, a), note: RISK_NOTES[q.id]?.[k] })), hint: 'Pick the closest, or tell me in your own words (for example "half of it in 3 years, the rest for retirement") and I\'ll work out the answer.' }),
    apply: (v, c) => { const n = Math.round(num(v.choice)); if (n < 1 || n > 5) bad('Choose one of the answers.'); c.answers.risk_answers = { ...(c.answers.risk_answers ?? {}), [q.id]: n }; return { me: q.a[n - 1]!, ack: ['Noted.', 'Thanks.', 'Got it.', 'Understood.', 'Thanks, that helps.'][i]! } } })),
  { id: 'risk_level', phase: 4, ai: true,
    ask: (c) => { const s = levelFromAnswers(c.answers.risk_answers ?? {}), L = RISK_LEVELS.find((l) => l.code === s)!, lim = RISK_LIMITS[s]; return 'From your answers' + ((c.answers.goals ?? []).length ? ' and your goals' : '') + ', I\'d suggest **' + L.label + '**: ' + L.text.charAt(0).toLowerCase() + L.text.slice(1) + (lim ? ' In practice: up to ' + lim.single + '% in any one company, ' + (lim.crypto ? 'up to ' + lim.crypto + '% in crypto' : 'no crypto') + ', and at least ' + lim.cash + '% kept in cash.' : '') + '\n\nYou can choose differently; your adviser sees both.' },
    widget: (c) => ({ kind: 'scale', options: RISK_LEVELS.map((l) => ({ value: l.code, label: l.label, note: l.text })), suggested: levelFromAnswers(c.answers.risk_answers ?? {}) }),
    apply: (v, c) => { const l = RISK_LEVELS.find((x) => x.code === v.level); if (!l) bad('Choose a risk level.'); c.answers.risk_level = l!.code; c.answers.risk_suggested = levelFromAnswers(c.answers.risk_answers ?? {}); return { me: 'Use ' + l!.label, ack: '**' + l!.label + '** it is.' } } },
  // US: the investing account.
  // Investing account now, or the plan first: the plan doesn't need the account, and it can be opened any time later.
  { id: 'account_when', phase: 5, ai: true,
    ask: (c) => 'Your plan has what it needs. ' + (c.country === 'NG' ? 'Next is your wallet and savings, which needs your BVN.' : 'Next is your investing account, which needs your ID details and Social Security number.') + ' You can do that now, or look at your plan first and open it whenever you\'re ready.',
    widget: (c) => ({ kind: 'choice', options: [{ value: 'now', label: c.country === 'NG' ? 'Set up my wallet now' : 'Open my investing account now' }, { value: 'later', label: 'Show me my plan first; I\'ll do this later' }] }),
    apply: (v, c) => { const later = v.choice === 'later'; c.answers.account_later = later; return { me: later ? 'Plan first, account later' : 'Now', ack: later ? 'No problem. You can open it any time from your dashboard.' : 'Great.' } } },
  { id: 'identity', phase: 5, ai: false,
    ask: () => 'Last part: your investing account, so you can buy stocks, ETFs and crypto from your dashboard. It\'s held in your name with our US brokerage partner, a registered broker-dealer, and your money stays in your name.\n\nFirst, your legal name, date of birth and mobile number?',
    widget: (c) => { const [g, ...f] = (c.contact ?? '').split(/\s+/); return { kind: 'form', fields: [{ key: 'given_name', label: 'First name', type: 'text', value: c.answers.identity?.given_name ?? g ?? '' }, { key: 'family_name', label: 'Last name', type: 'text', value: c.answers.identity?.family_name ?? f.join(' ') }, { key: 'date_of_birth', label: 'Date of birth', type: 'date', value: c.answers.identity?.date_of_birth ?? '' }, { key: 'phone', label: 'Mobile number', type: 'text', placeholder: '+1 408 555 0100', value: c.answers.identity?.phone ?? c.phone ?? '' }], submit: 'Continue' } },
    apply: (v, c) => { const g = str(v.given_name, 60), f = str(v.family_name, 60), d = str(v.date_of_birth, 10), p = str(v.phone, 30)
      if (!g || !f) bad('Add your first and last name as they appear on your ID.')
      const age = (Date.now() - Date.parse(d + 'T00:00:00Z')) / (365.25 * 86400e3); if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !(age >= 18 && age < 120)) bad('Add your date of birth (you need to be 18 or over).')
      if (p.replace(/\D/g, '').length < 10) bad('Add a mobile number with the area code.')
      c.answers.identity = { given_name: g, family_name: f, date_of_birth: d, phone: p }; return { me: g + ' ' + f + ' · born ' + d + ' · ' + p, ack: 'Thanks, ' + g + '.' } } },
  { id: 'ssn', phase: 5, ai: false,
    ask: () => 'And your Social Security number. It goes to our brokerage partner for the identity check that the law requires. We keep it encrypted only until your account is open, then delete it.',
    widget: () => ({ kind: 'form', fields: [{ key: 'ssn', label: 'Social Security number', type: 'secret', placeholder: '123-45-6789' }], submit: 'Continue' }),
    apply: async (v, c) => { const d = String(v.ssn ?? '').replace(/\D/g, ''); if (d.length !== 9) bad('A Social Security number has 9 digits.')
      await db().query('UPDATE wm.onboarding SET ssn_enc = $2 WHERE id = $1', [c.onbId, encryptText(d)]); c.answers.ssn_last4 = d.slice(-4)
      return { me: '•••-••-' + d.slice(-4), ack: 'Got it, ending ' + d.slice(-4) + '.' } } },
  { id: 'address', phase: 5, ai: false,
    ask: () => 'Your home address?',
    widget: (c) => ({ kind: 'form', fields: [{ key: 'street', label: 'Street address', type: 'text', value: c.answers.address?.street ?? '' }, { key: 'city', label: 'City', type: 'text', value: c.answers.address?.city ?? '' }, { key: 'state', label: 'State', type: 'text', placeholder: 'CA', value: c.answers.address?.state ?? '' }, { key: 'postal_code', label: 'ZIP code', type: 'text', value: c.answers.address?.postal_code ?? '' }], submit: 'Continue' }),
    apply: (v, c) => { const a = { street: str(v.street, 120), city: str(v.city, 60), state: str(v.state, 2).toUpperCase(), postal_code: str(v.postal_code, 10) }
      if (!a.street || !a.city || !/^[A-Z]{2}$/.test(a.state) || !/^\d{5}(-\d{4})?$/.test(a.postal_code)) bad('Add your street, city, the two-letter state and a 5-digit ZIP code.')
      c.answers.address = a; return { me: a.street + ', ' + a.city + ', ' + a.state + ' ' + a.postal_code, ack: 'Thanks.' } } },
  { id: 'funding', phase: 5, ai: true,
    ask: () => 'Where does the money you\'ll invest mostly come from?',
    widget: () => ({ kind: 'choice', options: FUNDING.map(([value, label]) => ({ value, label })) }),
    apply: (v, c) => { const f = FUNDING.find(([k]) => k === v.choice); if (!f) bad('Choose where the money comes from.'); c.answers.funding_source = f![0]; return { me: f![1], ack: 'Noted.' } } },
  { id: 'disclosures', phase: 5, ai: true,
    ask: () => 'Two quick checks the brokerage needs: do any of these apply to you or someone in your household?',
    widget: () => ({ kind: 'choice', options: DISCLOSE.map(([value, label]) => ({ value, label })) }),
    apply: (v, c) => { const d = DISCLOSE.find(([k]) => k === v.choice); if (!d) bad('Choose one.'); c.answers.disclosures = d![0]; return { me: d![1], ack: d![0] === 'none' ? 'Thanks.' : 'Thanks for telling me. The brokerage needs a few more details for that, so your adviser will be in touch to finish the account.' } } },
  { id: 'agree', phase: 5, ai: false,
    ask: () => 'Here\'s your account: an individual brokerage account for US stocks, ETFs and crypto, in your name. Tap "Read it" beside each one to see what it says, then tick to accept.',
    widget: (c) => ({ kind: 'agree', items: [{ key: 'customer', label: 'I have read and accept the brokerage customer agreement', required: true, href: '/w/agreement/customer' }, { key: 'crypto', label: 'Also enable crypto (I accept the crypto agreement)', required: false, href: '/w/agreement/crypto' }, { key: 'terms', label: 'I agree to Aidi Wealth\'s terms', required: true, href: '/legal/terms' }, { key: 'data', label: 'I have read the data protection notice: what we keep, what the AI reads and what we never collect', required: true, href: '/w/data-notice' }], submit: c.source === 'invite' ? 'Open my account' : 'Submit' }),
    apply: (v, c) => { if (!v.customer || !v.terms || !v.data) bad('Please accept the customer agreement, the terms and the data protection notice to continue.'); c.answers.agreed_at = new Date().toISOString(); c.answers.notice_version = DATA_NOTICE_VERSION; c.answers.crypto = !!v.crypto; return { me: 'I accept' + (v.crypto ? ', with crypto' : ''), ack: '' } } },
  // Nigeria: the BVN for the wallet and savings.
  { id: 'bvn', phase: 5, ai: false,
    ask: () => 'Last part: your wallet and savings. To verify you, I need your BVN (Bank Verification Number). It\'s kept encrypted, never shown to the AI and used only for the identity check. How we protect it is in the data protection notice, linked under the steps.',
    widget: () => ({ kind: 'form', fields: [{ key: 'bvn', label: 'BVN', type: 'secret', placeholder: '11 digits' }], submit: 'Continue' }),
    apply: async (v, c) => { const d = String(v.bvn ?? '').replace(/\D/g, ''); if (d.length !== 11) bad('A BVN has 11 digits.')
      await db().query('UPDATE wm.clients SET bvn_enc = $2, bvn_last4 = $3, updated_at = now() WHERE id = $1', [c.clientId, encryptText(d), d.slice(-4)]); c.answers.bvn_last4 = d.slice(-4)
      return { me: '•••••••' + d.slice(-4), ack: 'Thanks, ending ' + d.slice(-4) + '.' } } }]

export const PHASES = (country: 'US' | 'NG', account: boolean) => ['About you', 'Money in and out', 'What you own', 'Debts and goals', 'Your risk level', ...(account ? [country === 'NG' ? 'Your wallet' : 'Your investing account'] : []), 'Ready']
const ACCOUNT_US = ['identity', 'ssn', 'address', 'funding', 'disclosures', 'agree']
function stepsFor(c: { country: 'US' | 'NG'; account: boolean; answers?: Answers }) {
  const a = c.answers ?? {}
  return STEPS.filter((s) => s.phase < 5 || (c.account && (s.id === 'account_when' ? !a.account_resume : !a.account_later && (c.country === 'US' ? ACCOUNT_US.includes(s.id) : s.id === 'bvn'))))
}
const stepById = (id: string) => STEPS.find((s) => s.id === id)

interface Onb { id: string; client_id: string; source: 'invite' | 'request'; status: string; step: string; answers: Answers; messages: { role: 'ai' | 'me'; text: string; at: string }[]; request: Record<string, any>; account_status: string | null; account_note: string | null; ssn_enc: string | null }
async function load(clientId: string) {
  const o = (await db().query<Onb>('SELECT id, client_id, source, status, step, answers, messages, request, account_status, account_note, ssn_enc FROM wm.onboarding WHERE client_id = $1', [clientId])).rows[0]
  if (!o) return null
  const r = await railsFor(clientId)
  const ctx: Ctx = { country: r.c.country, account: r.c.country === 'US' ? r.alpaca : true, first: (r.c.contact_name || r.c.name).split(/\s+/)[0] ?? '', source: o.source, answers: o.answers ?? {}, clientId, onbId: o.id, contact: r.c.contact_name, phone: r.c.phone }
  return { o, ctx, r }
}
const say = (role: 'ai' | 'me', text: string) => ({ role, text, at: new Date().toISOString() })
async function save(o: Onb, ctx: Ctx) { await db().query('UPDATE wm.onboarding SET step = $2, answers = $3, messages = $4, updated_at = now() WHERE id = $1', [o.id, o.step, JSON.stringify(ctx.answers), JSON.stringify(o.messages.slice(-300))]) }

// The plan as it fills in, for the panel beside the conversation (and the adviser's review).
export function onboardSummaryFor(answers: Answers, country: 'US' | 'NG') { return summary({ country, answers } as Ctx) }
function summary(ctx: Ctx) {
  const c = cur(ctx), a = ctx.answers, inc = monthly(a.incomes, c), out = monthly(a.expenses, c)
  const spent = !!a.expenses?.length
  return { currency: c, income: a.incomes ? inc : null, spending: spent ? out : null, saved: a.incomes && spent ? Math.max(0, inc - out) : null, rate: a.incomes && spent && inc > 0 ? Math.max(0, (inc - out) / inc) : null,
    owns: a.assets ? a.assets.filter((x: any) => x.currency === c).reduce((t: number, x: any) => t + num(x.value), 0) : null, debts: a.debts ? a.debts.filter((x: any) => x.currency === c).reduce((t: number, x: any) => t + num(x.balance), 0) : null,
    goals: (a.goals ?? []).map((g: any) => g.name), risk: a.risk_level ? levelLabel(a.risk_level) : null, household: a.household ?? null }
}
export async function onboardView(clientId: string) {
  const l = await load(clientId)
  if (!l) return null
  const { o, ctx } = l
  const steps = stepsFor(ctx), cur0 = stepById(o.step)
  if (o.status === 'in_progress' && !o.messages.length && cur0) { o.messages.push(say('ai', cur0.ask(ctx))); await save(o, ctx) }
  const idx = steps.findIndex((s) => s.id === o.step)
  return { status: o.status, source: o.source, country: ctx.country, first: ctx.first, phases: PHASES(ctx.country, ctx.account), phase: o.status === 'in_progress' ? (cur0?.phase ?? 0) : PHASES(ctx.country, ctx.account).length - 1,
    step: o.status === 'in_progress' ? o.step : null, can_back: idx > 0, widget: o.status === 'in_progress' && cur0 ? cur0.widget(ctx) : null, messages: o.messages, plan: summary(ctx),
    account_status: o.account_status }
}

// Start over: clears every answer, the figures read from documents, the identity numbers held for the account and
// (by default) the files uploaded during the conversation, so nothing old is read again. Staff can also reset one
// that was sent for approval; a finished or declined one can't be reset.
export async function onboardRestart(clientId: string, opts: { files: boolean; staff?: boolean }) {
  const l = await load(clientId)
  if (!l) throw apiError('not_found', 'Not found', 404)
  const { o, ctx } = l
  if (!(o.status === 'in_progress' || (opts.staff && o.status === 'submitted' && o.account_status !== 'opened'))) throw apiError('done', 'This is already finished, so it can\'t be started again.', 409)
  ctx.answers = {}
  const first = stepsFor(ctx)[0]!
  o.step = first.id; o.messages = [say('ai', first.ask(ctx))]
  await db().query("UPDATE wm.onboarding SET status = 'in_progress', ssn_enc = NULL, account_status = NULL, account_note = NULL, submitted_at = NULL, updated_at = now() WHERE id = $1", [o.id])
  await db().query('UPDATE wm.clients SET bvn_enc = NULL, bvn_last4 = NULL, updated_at = now() WHERE id = $1', [clientId])
  await db().query("DELETE FROM wm.accounts WHERE client_id = $1 AND notes = 'From onboarding'", [clientId])
  await db().query("UPDATE wm.profiles SET data = data - 'equity' - 'doc_flags', updated_at = now() WHERE client_id = $1", [clientId])
  let removed = 0
  if (opts.files) { const ids = (await db().query<{ id: string }>('SELECT id FROM wm.profile_docs WHERE client_id = $1 AND created_at >= (SELECT created_at FROM wm.onboarding WHERE id = $2)', [clientId, o.id])).rows; for (const x of ids) await profileDocRemove(clientId, x.id); removed = ids.length }
  await save(o, ctx)
  return { removed }
}

// One answer: from the quick answers (value) or in the client's own words (text, read by the AI).
export async function onboardAnswer(clientId: string, input: { step: string; value?: any; text?: string; back?: boolean }, ip: string) {
  const l = await load(clientId)
  if (!l) throw apiError('not_found', 'Not found', 404)
  const { o, ctx } = l
  if (o.status !== 'in_progress') throw apiError('done', 'This is already finished.', 409)
  if (input.step !== o.step) throw apiError('stale', 'This question was already answered. Reload to carry on.', 409)
  const steps = stepsFor(ctx), i = steps.findIndex((s) => s.id === o.step), s = steps[i]!
  if (input.back) { if (i === 0) return; const p = steps[i - 1]!; o.step = p.id; o.messages.push(say('me', 'Go back')); o.messages.push(say('ai', 'Sure. ' + p.ask(ctx).replace(/^Hi [^\n]*\n\n/, ''))); await save(o, ctx); return }
  let out: { me: string; ack: string } | null = null
  if (input.text != null) {
    // Identity numbers typed into the chat are removed before anything is saved or read by the AI.
    const raw = input.text.trim().slice(0, 2000), text = s.ai ? redactIds(raw) : raw
    if (!text) throw apiError('invalid', 'Type an answer.')
    if (!s.ai) {
      // Never sent to the AI: the Social Security number, the BVN and the agreements.
      const d = text.replace(/\D/g, '')
      if (s.id === 'ssn' && d.length === 9) out = await s.apply({ ssn: d }, ctx)
      else if (s.id === 'bvn' && d.length === 11) out = await s.apply({ bvn: d }, ctx)
      else { o.messages.push(say('me', s.id === 'ssn' || s.id === 'bvn' || s.id === 'identity' || s.id === 'address' ? text.replace(/\d/g, '•') : redactIds(text))); o.messages.push(say('ai', s.id === 'identity' || s.id === 'address' ? 'Please use the boxes below for this one: identity details go straight to your secure record and are never read by the AI.' : s.id === 'agree' ? 'Tick the boxes below when you\'re ready; I can\'t accept agreements for you.' : s.id === 'ssn' ? 'The law requires it to open a US brokerage account; it\'s how the identity check works. Type the 9 digits in the box below; only the last four show here.' : 'Your BVN is how banks in Nigeria confirm who you are. Type the 11 digits in the box below; only the last four show here.')); await save(o, ctx); return }
    } else {
      const ai = await readAnswer(s, ctx, text).catch((e) => { console.error('[onboard] ai', e); return null })
      if (!ai) { o.messages.push(say('me', text)); o.messages.push(say('ai', 'Sorry, I didn\'t quite catch that. Could you use the boxes below, or say it another way?')); await save(o, ctx); return }
      if (!ai.understood || !ai.value) { o.messages.push(say('me', text)); o.messages.push(say('ai', ai.reply || 'Could you tell me a bit more?')); await save(o, ctx); return }
      try { const r = await s.apply(ai.value, ctx); out = { me: text, ack: ai.reply || r.ack } } catch (e) { o.messages.push(say('me', text)); o.messages.push(say('ai', ((e as { data?: { error?: { message?: string } } }).data?.error?.message ?? 'I need a little more detail.') + ' You can also fill it in below.')); await save(o, ctx); return }
    }
  } else out = await s.apply(input.value ?? {}, ctx)
  o.messages.push(say('me', out!.me))
  // Worked out again: an answer can change the steps (the investing account left for later).
  const after = stepsFor(ctx), next = after[after.findIndex((x) => x.id === s.id) + 1]
  if (next) { o.step = next.id; o.messages.push(say('ai', [out!.ack, next.ask(ctx)].filter(Boolean).join('\n\n'))); await save(o, ctx); return }
  o.step = 'done'; await save(o, ctx)
  await finish(o, ctx, ip, out!.ack)
}

// The AI reads a free-text answer into the shape of the current question, and words the reply.
async function readAnswer(s: Step, ctx: Ctx, text: string) {
  const w = s.widget(ctx)
  const shape = w.kind === 'form' ? '{' + w.fields!.map((f) => '"' + f.key + '": ' + (f.type === 'number' ? 'number' : f.type === 'date' ? '"YYYY-MM-DD"' : 'string')).join(', ') + '}'
    : w.kind === 'rows' ? '{"rows": [{' + w.columns!.map((c) => '"' + c.key + '": ' + (c.type === 'number' ? 'number' : c.options ? c.options.map((o) => '"' + o[0] + '"').join('|') : c.type === 'date' ? '"YYYY-MM-DD"' : 'string')).join(', ') + '}]}' + (w.skip ? ' or {"skip": true} if they have none' : '')
      : w.kind === 'choice' ? '{"choice": ' + w.options!.map((o) => '"' + o.value + '" (' + o.label + ')').join(' | ') + '}'
        : w.kind === 'scale' ? '{"level": ' + w.options!.map((o) => '"' + o.value + '"').join(' | ') + '}' : '{}'
  const { output } = await runAiTool({ task: 'wm_onboard', model: (useRuntimeConfig() as unknown as Record<string, string>).aiModelAnalyst || useRuntimeConfig().aiModelPitchScreen, promptVersion: 'wm-onboard-v1', inputRef: 'wm_onboarding:' + ctx.onbId, maxTokens: 700,
    system: 'You are the Aidi Wealth assistant, chatting with a new client to set up their financial plan. Warm, plain and brief, like a good adviser: short sentences, no jargon, no emojis, no investment advice, never name any brokerage or provider. The client is in ' + (ctx.country === 'NG' ? 'Nigeria (default currency NGN)' : 'the United States (default currency USD)') + '. Read their answer into the JSON shape asked for. Amounts: "18k" is 18000, "2m" 2000000; "after tax" amounts are fine as given; if they give a yearly figure use frequency annual. If the answer is clear, set understood true, fill value, and write reply: one short sentence confirming what you understood in plain words with the key figures in **bold** (do not ask the next question; it is added after). If it is unclear, or they asked a question, set understood false and reply with a short answer or one clarifying question.',
    user: 'Question asked: ' + s.ask(ctx).replace(/^Hi [^\n]*\n\n/, '') + '\nShape for value: ' + shape + (s.id.startsWith('risk_') ? '\nHow to read risk answers: they may answer with a number of years, a date, percentages or a story. Pick the closest answer and say in the reply, in plain words, which one you chose and why (e.g. "Most of it is for 2031, so I\'ve put In 5 to 10 years."). If the money is split, go by where more than half of it is needed. If they ask what the question means or are unsure, set understood to false and explain it in one or two short sentences with an example from their situation, then ask again.' : '') + '\nWhat we know so far: ' + JSON.stringify(summary(ctx)) + '\nTheir answer: ' + text,
    toolName: 'record_answer', toolDescription: 'Record what the client said for the current question, and the reply to show them.',
    jsonSchema: { type: 'object', properties: { understood: { type: 'boolean' }, value: { type: 'object' }, reply: { type: 'string' } }, required: ['understood', 'reply'] },
    schema: z.object({ understood: z.boolean(), value: z.record(z.string(), z.any()).nullable().optional(), reply: z.string().max(1500) }) })
  return output
}

// What was read from the documents, as answers to check: accounts (employer stock included), money in and out, debts;
// employer stock plans and planning points are kept for the plan. Returns the message for the client.
function docReply(r: DocReadOut, nRead: number, nSkipped: number, c: Ctx): string {
  const s = (c.answers.suggest ??= {}) as Record<string, Record<string, unknown>[]>
  const add = (k: string, rows: Record<string, unknown>[]) => { const have = s[k] ?? []; for (const x of rows) if (!have.some((h) => JSON.stringify(h) === JSON.stringify(x))) have.push(x); s[k] = have.slice(0, 20) }
  const kindOf = (k: string) => (k === 'company_stock' ? 'brokerage' : ['brokerage', 'retirement', 'bank', 'savings', 'crypto'].includes(k) ? k : 'other')
  add('assets', r.accounts.filter((a) => a.value > 0).map((a) => ({ name: a.kind === 'company_stock' ? a.institution + ' (employer stock)' : a.institution, kind: kindOf(a.kind), value: Math.round(a.value), currency: a.currency })))
  // Stock pay (RSU vests, ESPP) is not money coming in each month: it stays with the stock and is noted for the adviser,
  // so the income answer is cash pay only. A newer read replaces an older suggestion with the same name.
  const isStock = (x: { source: string }) => /rsu|restricted stock|espp|vest/i.test(x.source)
  const cash = r.incomes.filter((x) => x.amount > 0 && !isStock(x)), stock = r.incomes.filter((x) => x.amount > 0 && isStock(x))
  s.incomes = (s.incomes ?? []).filter((h) => !isStock({ source: String(h.source ?? '') }) && !cash.some((x) => x.source.toLowerCase() === String(h.source ?? '').toLowerCase()))
  add('incomes', cash.map((x) => ({ source: x.source, amount: Math.round(x.amount), frequency: x.frequency, currency: x.currency })))
  for (const x of stock) r.flags.push({ title: 'Stock pay: about ' + money(x.amount, x.currency) + ' a year', detail: x.source + '. Kept with the stock holdings, not counted as monthly income, because vests are uneven and paid in shares.' })
  add('expenses', r.expenses.filter((x) => x.amount > 0).map((x) => ({ category: x.category, amount: Math.round(x.amount), frequency: x.frequency, currency: x.currency })))
  add('debts', r.debts.filter((x) => x.balance > 0).map((x) => ({ name: x.name, balance: Math.round(x.balance), payment: x.payment ? Math.round(x.payment) : '', currency: x.currency })))
  if (r.equity.length) c.answers.equity = [...(c.answers.equity ?? []).filter((e: { company: string }) => !r.equity.some((n) => n.company.toLowerCase() === e.company.toLowerCase())), ...r.equity].slice(0, 10)
  const flags = [...r.flags, ...docChecks(r)]; if (flags.length) c.answers.doc_flags = [...(c.answers.doc_flags ?? []), ...flags].filter((f, i, a) => a.findIndex((g: { title: string }) => g.title === f.title) === i).slice(0, 12)
  const usd = (v: number, cu = 'USD') => money(v, cu)
  const lines: string[] = []
  for (const e of r.equity) {
    const v = e.value ?? (e.shares_held && e.price ? e.shares_held * e.price : null)
    if (e.shares_held) lines.push('**' + e.company + ' stock**: ' + e.shares_held.toLocaleString('en-US') + ' shares' + (v ? ' worth ' + usd(v) : '') + (e.as_of ? ' (' + e.as_of + ')' : ''))
    for (const x of e.vested.slice(0, 3)) lines.push('RSU release ' + x.date + ': ' + x.shares + ' shares' + (x.gross ? ', ' + usd(x.gross) + ' before tax' : '') + (x.withheld_shares ? ', ' + x.withheld_shares + ' withheld for tax' : ''))
    if (e.espp.length) lines.push('ESPP: ' + e.espp.map((x) => x.shares + ' shares on ' + x.date + (x.purchase_price ? ' at ' + usd(x.purchase_price) : '')).join('; '))
  }
  for (const a of r.accounts.filter((a) => a.kind !== 'company_stock').slice(0, 5)) lines.push(a.institution + ': ' + usd(a.value, a.currency))
  for (const x of cash.slice(0, 3)) lines.push(x.source + ': ' + usd(x.amount, x.currency) + (x.frequency === 'annual' ? ' a year' : ' a month'))
  for (const x of stock.slice(0, 2)) lines.push(x.source + ': about ' + usd(x.amount, x.currency) + ' a year in shares (kept with your stock, not counted as monthly income)')
  for (const x of r.debts.slice(0, 3)) lines.push(x.name + ': ' + usd(x.balance, x.currency) + ' owed')
  const head = 'I read ' + (nRead === 1 ? 'your document' : nRead + ' documents') + (nSkipped ? ' (' + nSkipped + ' I couldn\'t read: photos or scans; your adviser will look at ' + (nSkipped === 1 ? 'it' : 'them') + ')' : '') + '.'
  if (!lines.length) return head + ' I didn\'t find figures I could use in ' + (nRead === 1 ? 'it' : 'them') + ', so add rough figures below, or skip.'
  return head + ' Here\'s what I found:\n\n- ' + lines.slice(0, 10).join('\n- ') + '\n\nI\'ve put the figures in the answers for you to check when we get to them; nothing is saved until you confirm.' + (flags.length ? ' Your adviser will also look at: ' + flags.slice(0, 3).map((f) => f.title.toLowerCase()).join('; ') + '.' : '')
}

// Statements and other documents dropped into the conversation go with the plan.
export async function onboardUpload(clientId: string, parts: { name?: string; filename?: string; type?: string; data: Buffer }[]) {
  const l = await load(clientId)
  if (!l || l.o.status !== 'in_progress') throw apiError('done', 'This is already finished.', 409)
  const ids = await planUploadIds(clientId, parts), n = ids.length
  if (!n) throw apiError('invalid', 'Upload a PDF, image, CSV or Excel file up to 20 MB.')
  l.o.messages.push(say('me', 'Uploaded ' + n + ' file' + (n === 1 ? '' : 's')))
  // Read them straight away (identity numbers are removed first) and offer what was found as answers to check.
  let reply = 'Thanks, I\'ve added ' + (n === 1 ? 'it' : 'them') + ' to your plan; your adviser and the review will use ' + (n === 1 ? 'it' : 'them') + '. A rough figure below is still helpful for now, or skip it.'
  try {
    const r = await readClientDocs(clientId, ids)
    const names = (await db().query<{ name: string | null }>('SELECT name FROM wm.profile_docs WHERE id = ANY($1::uuid[])', [ids])).rows.map((x) => x.name || 'document')
    l.ctx.answers.doc_log = [...(l.ctx.answers.doc_log ?? []), ...names.map((n) => ({ name: n, read: r.read.includes(n) }))].slice(-40)
    if (r.read.length) reply = docReply(r.out, r.read.length, r.skipped.length, l.ctx)
    else if (r.skipped.length) reply = 'Thanks, I\'ve kept ' + (n === 1 ? 'it' : 'them') + ' with your plan for your adviser. I can only read figures from PDF, Excel or CSV files with text in them (not photos or scans), so add rough figures below, or upload the PDF statement.'
  } catch (e) { console.error('[onboard] read docs', e) }
  l.o.messages.push(say('ai', reply))
  await save(l.o, l.ctx)
}

// The end of the conversation: the plan, what they own, the risk level and the contact details are saved. Invited
// clients get their account opened and the dashboard; website requests wait for an adviser.
async function finish(o: Onb, ctx: Ctx, ip: string, ack: string) {
  const a = ctx.answers, id = ctx.clientId
  if (a.account_resume) return finishAccount(o, ctx, ip, ack)
  await planSave(id, { household: a.household ?? {}, incomes: (a.incomes ?? []).map((r: any) => ({ who: '', source: r.source || 'Income', amount: r.amount, frequency: r.frequency, currency: r.currency })), taxes: [],
    expenses: (a.expenses ?? []).map((r: any) => ({ category: r.category || 'Spending', amount: r.amount, frequency: r.frequency, currency: r.currency })),
    debts: (a.debts ?? []).map((r: any) => ({ name: r.name, ...(r.lender ? { lender: String(r.lender) } : {}), balance: r.balance, ...(r.payment ? { payment: r.payment } : {}), currency: r.currency })), credit_scores: [],
    goals: (a.goals ?? []).map((g: any) => ({ name: g.name, ...(g.target ? { target: g.target } : {}), ...(g.by ? { by: g.by } : {}) })), notes: '',
    ...(a.equity?.length ? { equity: a.equity } : {}), ...(a.doc_flags?.length ? { doc_flags: a.doc_flags } : {}) }).catch((e) => console.error('[onboard] plan save', e))
  await db().query("DELETE FROM wm.accounts WHERE client_id = $1 AND notes = 'From onboarding'", [id])
  for (const x of a.assets ?? []) await db().query("INSERT INTO wm.accounts (client_id, provider, institution, kind, name, currency, balance, as_of, notes) VALUES ($1,'manual',$2,$3,NULL,$4,$5,current_date,'From onboarding')", [id, String(x.name).slice(0, 120), x.kind, x.currency, x.value])
  const name = a.identity ? a.identity.given_name + ' ' + a.identity.family_name : null
  await db().query("UPDATE wm.clients SET risk_profile = coalesce($2, risk_profile), risk_answers = coalesce($3::jsonb, risk_answers), risk_set_by = CASE WHEN $2 IS NULL THEN risk_set_by ELSE 'client' END, risk_set_at = CASE WHEN $2 IS NULL THEN risk_set_at ELSE now() END, phone = coalesce($4, phone), contact_name = coalesce(contact_name, $5), updated_at = now() WHERE id = $1",
    [id, a.risk_level ?? null, a.risk_answers ? JSON.stringify(a.risk_answers) : null, a.identity?.phone ?? null, name])
  const acct = !ctx.account ? 'not_needed' : a.account_later ? 'later' : ctx.country === 'NG' ? 'not_needed' : a.disclosures && a.disclosures !== 'none' ? 'held' : 'waiting'
  await db().query('UPDATE wm.onboarding SET account_status = $2, account_note = $3, submitted_at = now(), updated_at = now() WHERE id = $1', [o.id, acct, acct === 'held' ? 'A disclosure applies (' + a.disclosures + '): the brokerage needs more details before opening.' : null])
  if (o.source === 'invite') {
    let opened = acct !== 'waiting'
    if (acct === 'waiting') opened = await openAccount(o.id, id, ip)
    await db().query("UPDATE wm.onboarding SET status = 'done', decided_at = now() WHERE id = $1", [o.id])
    await db().query("UPDATE wm.clients SET status = 'active', updated_at = now() WHERE id = $1 AND status IN ('prospect', 'onboarding')", [id])
    o.messages.push(say('ai', [ack, 'That\'s everything. Your financial plan is being prepared' + (acct === 'waiting' ? (opened ? ', and your investing account is open' : '; your investing account is with our partner and your adviser will finish it if anything is needed') : '') + '. Your dashboard is ready.'].filter(Boolean).join('\n\n')))
    kickPlan(id)
    void onboardSlack(o, ctx, acct, false).catch((e) => console.error('[onboard] slack', e))
  } else {
    await db().query("UPDATE wm.onboarding SET status = 'submitted' WHERE id = $1", [o.id])
    o.messages.push(say('ai', [ack, 'That\'s everything, thank you. An adviser will look over your answers, usually within one working day, and we\'ll email you as soon as your dashboard opens.'].filter(Boolean).join('\n\n')))
    const c = (await db().query<{ email: string | null; name: string }>('SELECT email, name FROM wm.clients WHERE id = $1', [id])).rows[0]
    if (c?.email) { try { await sendWealthReviewing(c.email, ctx.first) } catch (e) { console.error('[onboard] reviewing email', e) } }
    void onboardSlack(o, ctx, acct, true).catch((e) => console.error('[onboard] slack', e))
  }
  await db().query('UPDATE wm.onboarding SET messages = $2, updated_at = now() WHERE id = $1', [o.id, JSON.stringify(o.messages.slice(-300))])
  await sendDataRecord(o, ctx).catch((e) => console.error('[onboard] data record', e))
}

// The investing account (or wallet), opened later from the dashboard: only the account steps run, the plan and answers
// already saved are left as they are, and no new approval is needed.
async function finishAccount(o: Onb, ctx: Ctx, ip: string, ack: string) {
  const a = ctx.answers, id = ctx.clientId
  const acct = ctx.country === 'NG' ? 'not_needed' : a.disclosures && a.disclosures !== 'none' ? 'held' : 'waiting'
  await db().query('UPDATE wm.onboarding SET account_status = $2, account_note = $3, updated_at = now() WHERE id = $1', [o.id, acct, acct === 'held' ? 'A disclosure applies (' + a.disclosures + '): the brokerage needs more details before the account can open.' : null])
  const opened = acct === 'waiting' ? await openAccount(o.id, id, ip) : acct !== 'held'
  delete a.account_resume
  await db().query("UPDATE wm.onboarding SET status = 'done', answers = $2, updated_at = now() WHERE id = $1", [o.id, JSON.stringify(a)])
  o.messages.push(say('ai', [ack, ctx.country === 'NG' ? 'Your wallet and savings are set up.' : opened ? 'Your investing account is open.' : 'Your investing account is with our partner; your adviser will finish it if anything is needed.'].filter(Boolean).join('\n\n')))
  await db().query('UPDATE wm.onboarding SET messages = $2, updated_at = now() WHERE id = $1', [o.id, JSON.stringify(o.messages.slice(-300))])
  slack('aidi.wealth_client', 'A client opened their ' + (ctx.country === 'NG' ? 'wallet' : 'investing account') + ' from the dashboard', [['Account', acct]], { label: 'Open the client', path: '/wealth-mgmt/clients/' + id })
}

// The one Slack alert for an Aidi Wealth onboarding, when the conversation is finished: who they are, where they came
// from, their figures, documents, risk level and account, and whether an adviser needs to approve them.
async function onboardSlack(o: Onb, ctx: Ctx, acct: string, waiting: boolean) {
  const c = (await db().query<{ name: string; email: string | null; phone: string | null; inviter: string | null; started: string }>(
    "SELECT c.name, c.email, c.phone, (SELECT p.full_name FROM core.users u JOIN core.people p ON p.id = u.person_id WHERE u.id = ob.invited_by) AS inviter, ob.created_at AS started FROM wm.clients c JOIN wm.onboarding ob ON ob.client_id = c.id WHERE c.id = $1", [ctx.clientId]).catch(() => ({ rows: [] as any[] }))).rows[0]
  const s = summary(ctx), cu = s.currency, mo = (v: number | null) => (v == null ? '—' : money(v, cu)), req = o.request ?? {}
  const AMT: Record<string, string> = { under_50k: 'Under $50k', '50k_250k': '$50k to $250k', '250k_1m': '$250k to $1M', over_1m: 'Over $1M' }
  const HELP: Record<string, string> = { plan: 'Financial plan', investing: 'Investing', retirement: 'Retirement', children: 'Children', metals: 'Gold and silver', everything: 'Everything' }
  const ACCT: Record<string, string> = { waiting: 'Opens on approval', opened: 'Open', held: 'Held: a disclosure needs details', failed: 'Not opened yet', not_needed: ctx.country === 'NG' ? 'Wallet (BVN given)' : 'Not needed', later: 'Client chose later' }
  const docs = (ctx.answers.doc_log ?? []) as { read: boolean }[], mins = c?.started ? Math.round((Date.now() - Date.parse(c.started)) / 60000) : null
  const fields: [string, string][] = [
    ['Email', c?.email ?? '—'], ['Phone', c?.phone ?? req.phone ?? '—'],
    ['Country', ctx.country === 'NG' ? 'Nigeria' : 'United States'], ['Came from', o.source === 'request' ? 'Website request' + (req.source ? ' (' + req.source + ')' : '') : 'Invited' + (c?.inviter ? ' by ' + c.inviter : '')],
    ['To invest', AMT[req.amount] ?? 'Not said'], ['Help with', (req.help ?? []).map((h: string) => HELP[h] ?? h).join(', ') || 'Not said'],
    ['Income a month', mo(s.income)], ['Spending a month', mo(s.spending)],
    ['Keeps', s.rate == null ? '—' : Math.round(s.rate * 100) + '% of income'], ['Owns', mo(s.owns)],
    ['Debts', mo(s.debts)], ['Goals', s.goals.join(', ') || 'None yet'],
    ['Risk level', s.risk ?? 'Not set'], ['Household', s.household ? s.household.adults + ' adult' + (s.household.adults === 1 ? '' : 's') + (s.household.children ? ', ' + s.household.children + ' children' : '') + (s.household.location ? ' · ' + s.household.location : '') : '—'],
    ['Documents', docs.length ? docs.length + ' uploaded, ' + docs.filter((d) => d.read).length + ' read by AI' : 'None'], ['Investing account', ACCT[acct] ?? acct],
    ['Took', mins == null ? '—' : mins < 60 ? mins + ' min' : Math.round(mins / 60) + ' h'],
  ]
  slack('aidi.wealth_client', '*' + (c?.name ?? 'A client') + '* finished Aidi Wealth onboarding · ' + (waiting ? 'waiting for your approval' : 'now on their dashboard'), fields, waiting ? { label: 'Review and approve', path: '/wealth-mgmt?t=onboarding' } : { label: 'Open the client', path: '/wealth-mgmt/clients/' + ctx.clientId })
}

// From the dashboard: carry on with the investing account (or wallet) that was left for later.
export async function onboardOpenAccount(clientId: string) {
  const l = await load(clientId)
  if (!l) throw apiError('not_found', 'Not found', 404)
  const { o, ctx } = l
  if (o.status !== 'done' || o.account_status !== 'later') throw apiError('state', 'There is no account waiting to be opened.', 409)
  ctx.answers.account_later = false; ctx.answers.account_resume = true
  const first = stepsFor(ctx).find((s) => s.phase === 5)
  if (!first) throw apiError('state', 'There is no account to open here.', 409)
  await db().query("UPDATE wm.onboarding SET status = 'in_progress' WHERE id = $1", [o.id])
  o.step = first.id; o.messages.push(say('ai', 'Welcome back. Let\'s open your ' + (ctx.country === 'NG' ? 'wallet and savings' : 'investing account') + '.\n\n' + first.ask(ctx)))
  await save(o, ctx)
}

// After onboarding: the data record (what they told us, what they uploaded and whether the AI read it, what was kept
// out of the AI and what is never collected) with the data protection notice for their country, as a PDF saved to
// their documents and emailed to them.
async function sendDataRecord(o: Onb, ctx: Ctx) {
  const x = await docContext(ctx.clientId), a = ctx.answers
  const n = { country: ctx.country, entity: noticeEntity(x.entity, ctx.country), address: x.c.entity_address }
  const topics = [a.household && 'Your household', a.incomes?.length && 'Your income', a.expenses?.length && 'Your spending', a.assets?.length && 'What you own', a.debts?.length && 'Your debts', a.goals?.length && 'Your goals',
    a.risk_level && 'Your answers to the risk questions and your risk level', a.equity?.length && 'Employer stock and stock plan details from your documents',
    a.identity && 'Identity details for your investing account: name, date of birth and phone', a.address && 'Your home address', a.funding && 'How you plan to fund the account', a.disclosures && 'Your answers to the regulatory questions'].filter(Boolean) as string[]
  const log: { name: string; read: boolean }[] = a.doc_log ?? []
  const files = (await db().query<{ name: string | null; created_at: string }>('SELECT name, created_at FROM wm.profile_docs WHERE client_id = $1 AND created_at >= (SELECT created_at FROM wm.onboarding WHERE id = $2) ORDER BY created_at', [ctx.clientId, o.id])).rows
    .map((f) => ({ name: f.name || 'document', at: f.created_at, read: log.some((l) => l.name === (f.name || 'document') && l.read) }))
  const who = x.c.contact_name || x.c.name, at = new Date().toISOString()
  const rec = dataRecordMd(n, { name: who, finishedAt: at, files, identity: a.ssn_last4 ? 'ssn' : a.bvn_last4 ? 'bvn' : null, topics })
  const nTitle = dataNoticeTitle(ctx.country), notice = dataNoticeMd(n), title = 'Your data record and data protection notice'
  const bytes = await legalPdf(n.entity, dataDocs(n, { name: who, finishedAt: at, md: rec }), { logo: 'aidi' })
  const doc = await storePdf(bytes, title + ' - ' + x.c.name + '.pdf', null, { wm: true })
  await db().query("INSERT INTO wm.client_docs (client_id, kind, title, body_md, doc_id, requires_signature, status) VALUES ($1,'data_notice',$2,$3,$4,false,'info')", [ctx.clientId, title, rec + '\n\n# ' + nTitle + '\n\n' + notice, doc])
  if (!x.c.email) return
  const hi = 'Hi ' + (ctx.first || 'there') + ','
  const body = 'Attached is the record of what you shared while setting up your Aidi Wealth account: what you told us, the documents you uploaded and whether our AI read them, what we kept out of the AI and what we never collect. It also has our data protection notice. A copy is saved in Documents in your portal.'
  await sendEmail({ to: x.c.email, subject: 'Your Aidi Wealth data record', brand: 'aidi', text: hi + '\n\n' + body + '\n\n' + brands().aidi.url + '/w',
    html: '<p>' + hi + '</p><p>' + body + '</p><p><a href="' + brands().aidi.url + '/w" style="color:#1c4f9c">Open your portal</a></p>', attachments: [{ filename: 'Aidi Wealth data record.pdf', content: bytes }] })
}
function kickPlan(id: string) { void planGenerate(id, null).catch((e) => console.error('[onboard] plan review', e)) }

// Open the investing account with the brokerage partner from the answers and the encrypted Social Security number,
// which is deleted once the account exists. A failure is kept on the row for an adviser to retry.
export async function openAccount(onbId: string, clientId: string, ip: string): Promise<boolean> {
  const o = (await db().query<{ answers: Answers; ssn_enc: string | null }>('SELECT answers, ssn_enc FROM wm.onboarding WHERE id = $1', [onbId])).rows[0]
  const c = (await db().query<{ email: string | null }>('SELECT email FROM wm.clients WHERE id = $1', [clientId])).rows[0]
  try {
    if (!o?.ssn_enc) throw new Error('The Social Security number is missing; ask the client to add it again.')
    if (await providerRow(clientId, 'alpaca').then((x) => x?.external_id)) { await db().query("UPDATE wm.onboarding SET account_status = 'opened', ssn_enc = NULL, account_note = NULL WHERE id = $1", [onbId]); return true }
    const a = o.answers, ssn = decryptText(o.ssn_enc), at = a.agreed_at ?? new Date().toISOString()
    const agreements = [{ agreement: 'customer_agreement', signed_at: at, ip_address: ip }, ...(a.crypto ? [{ agreement: 'crypto_agreement', signed_at: at, ip_address: ip }] : [])]
    const acct = await alpaca('/v1/accounts', 'POST', { contact: { email_address: c?.email, phone_number: a.identity.phone, street_address: [a.address.street], city: a.address.city, state: a.address.state, postal_code: a.address.postal_code },
      identity: { given_name: a.identity.given_name, family_name: a.identity.family_name, date_of_birth: a.identity.date_of_birth, tax_id: ssn.replace(/^(\d{3})(\d{2})(\d{4})$/, '$1-$2-$3'), tax_id_type: 'USA_SSN', country_of_citizenship: 'USA', country_of_birth: 'USA', country_of_tax_residence: 'USA', funding_source: [a.funding_source || 'employment_income'] },
      disclosures: { is_control_person: false, is_affiliated_exchange_or_finra: false, is_politically_exposed: false, immediate_family_exposed: false }, agreements, enabled_assets: a.crypto ? ['us_equity', 'crypto'] : ['us_equity'] })
    await saveProvider(clientId, 'alpaca', acct.id, acct.status ?? 'SUBMITTED', { account_number: acct.account_number ?? null, opened_at: new Date().toISOString() })
    await db().query("UPDATE wm.clients SET kyc_provider = 'alpaca', kyc_status = CASE WHEN kyc_status = 'verified' THEN kyc_status ELSE 'pending' END, updated_at = now() WHERE id = $1", [clientId])
    await db().query("UPDATE wm.onboarding SET account_status = 'opened', ssn_enc = NULL, account_note = NULL WHERE id = $1", [onbId])
    return true
  } catch (e) {
    const m = (e as { data?: { message?: string; error?: { message?: string } }; message?: string }).data?.message ?? (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? (e as Error).message
    console.error('[onboard] open account', m)
    await db().query("UPDATE wm.onboarding SET account_status = 'failed', account_note = $2 WHERE id = $1", [onbId, String(m).slice(0, 500)])
    return false
  }
}

// An adviser approves a website request: the account is opened, the client is emailed and the dashboard opens.
export async function onboardApprove(onbId: string, userId: string, ip: string) {
  const o = (await db().query<{ client_id: string; status: string; account_status: string | null }>('SELECT client_id, status, account_status FROM wm.onboarding WHERE id = $1', [onbId])).rows[0]
  if (!o) throw apiError('not_found', 'Not found', 404)
  if (o.status !== 'submitted') throw apiError('state', o.status === 'in_progress' ? 'The client has not finished the conversation yet.' : 'This was already decided.', 409)
  const opened = o.account_status === 'waiting' || o.account_status === 'failed' ? await openAccount(onbId, o.client_id, ip) : true
  await db().query("UPDATE wm.onboarding SET status = 'done', decided_at = now(), decided_by = $2, updated_at = now() WHERE id = $1", [onbId, userId])
  await db().query("UPDATE wm.clients SET status = 'active', updated_at = now() WHERE id = $1", [o.client_id])
  const c = (await db().query<{ email: string | null; contact_name: string | null; name: string }>('SELECT email, contact_name, name FROM wm.clients WHERE id = $1', [o.client_id])).rows[0]
  if (c?.email) { try { await sendWealthOpen(c.email, (c.contact_name || c.name).split(/\s+/)[0] ?? '') } catch (e) { console.error('[onboard] open email', e) } }
  kickPlan(o.client_id)
  return { opened }
}
export async function onboardDecline(onbId: string, userId: string, note: string) {
  const o = (await db().query<{ client_id: string; status: string }>('SELECT client_id, status FROM wm.onboarding WHERE id = $1', [onbId])).rows[0]
  if (!o) throw apiError('not_found', 'Not found', 404)
  if (o.status === 'done' || o.status === 'declined') throw apiError('state', 'This was already decided.', 409)
  await db().query("UPDATE wm.onboarding SET status = 'declined', ssn_enc = NULL, decided_at = now(), decided_by = $2, decision_note = $3, updated_at = now() WHERE id = $1", [onbId, userId, note || null])
  await db().query("UPDATE wm.clients SET status = 'closed', updated_at = now() WHERE id = $1", [o.client_id])
  const c = (await db().query<{ email: string | null; contact_name: string | null; name: string }>('SELECT email, contact_name, name FROM wm.clients WHERE id = $1', [o.client_id])).rows[0]
  if (c?.email) { try { await sendWealthDecline(c.email, (c.contact_name || c.name).split(/\s+/)[0] ?? '', note) } catch (e) { console.error('[onboard] decline email', e) } }
}

// Portal access for a client (an invite, or a website request): a user with the wealth_client role, and the
// conversation waiting for them unless they have already been through it.
export async function grantPortal(clientId: string, email: string, name: string, entityId: string | null, by: string | null, source: 'invite' | 'request', request: Record<string, unknown> = {}) {
  let uid = (await db().query<{ id: string }>('SELECT id FROM core.users WHERE email = $1', [email])).rows[0]?.id
  if (!uid) { const p = await one<{ id: string }>("INSERT INTO core.people (full_name, email, kind) VALUES ($1,$2,'client') ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id", [name, email]); uid = (await one<{ id: string }>('INSERT INTO core.users (person_id, email) VALUES ($1,$2) RETURNING id', [p.id, email])).id }
  await db().query('INSERT INTO core.memberships (user_id, invited_by) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uid, by])
  if (!(await db().query("SELECT 1 FROM core.user_roles WHERE user_id = $1 AND role_code = 'wealth_client'", [uid])).rowCount) await db().query("INSERT INTO core.user_roles (user_id, role_code, scope_entity_id, granted_by) VALUES ($1,'wealth_client',$2,$3)", [uid, entityId, by])
  const had = (await db().query<{ user_id: string | null; status: string }>('SELECT user_id, status FROM wm.clients WHERE id = $1', [clientId])).rows[0]
  await db().query('UPDATE wm.clients SET user_id = $2, updated_at = now() WHERE id = $1', [clientId, uid])
  // Clients already set up before onboarding existed keep going straight to their dashboard.
  if (!had?.user_id || had.status !== 'active') await db().query('INSERT INTO wm.onboarding (client_id, source, invited_by, request) VALUES ($1,$2,$3,$4) ON CONFLICT (client_id) DO NOTHING', [clientId, source, by, JSON.stringify(request)])
  return uid
}
export async function onboardingStatus(clientId: string) { return (await db().query<{ status: string }>('SELECT status FROM wm.onboarding WHERE client_id = $1', [clientId])).rows[0]?.status ?? null }
