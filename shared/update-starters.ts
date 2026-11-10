// Ready-made investor update formats every company can start from: a full quarterly report and a short monthly update.
// Words in [brackets] are for the founder to fill in; the figures in charts and tables come from their books.
export interface Starter { key: 'quarterly' | 'monthly'; name: string; about: string; period_type: 'quarter' | 'month'; blocks: (company: string, label: string) => Record<string, unknown>[] }

export const STARTERS: Starter[] = [
  {
    key: 'quarterly', name: 'Quarterly investor report', period_type: 'quarter',
    about: 'A full quarterly report: an opening summary, key figures, highlights, product and customers, challenges, next quarter and asks.',
    blocks: (company, label) => [
      { type: 'text', md: 'Good day, Investor,\n\n**' + label + '** was [a strong / a steady] quarter for ' + company + '. We recorded **[$0.00M]** in revenue for the quarter, up **[0]%** on the quarter before, and revenue for the last 12 months reached **[$0.00M]**.\n\n[One or two sentences on the most important thing that happened this quarter.]' },
      { type: 'metrics_table', title: 'Key figures', metrics: ['revenue', 'gross_margin', 'net_income', 'cash'], period: 'quarter', count: 4 },
      { type: 'text', md: '# Highlights\n\n- **[Win]:** [what happened and why it matters]\n- **[Win]:** [what happened and why it matters]\n- **[Win]:** [what happened and why it matters]' },
      { type: 'two_charts', left: { type: 'chart', title: 'Revenue', metrics: ['revenue'], period: 'quarter', count: 6 }, right: { type: 'chart', title: 'Cash', metrics: ['cash'], period: 'month', count: 6 } },
      { type: 'text', md: '# Product and customers\n\n[New customers, products launched and how usage moved this quarter.]\n\n| Product | [Month 1] | [Month 2] | [Month 3] |\n|---|---|---|---|\n| [Product] | [0] | [0] | [0] |\n| [Product] | [0] | [0] | [0] |' },
      { type: 'text', md: '# Challenges\n\n- [What did not go to plan, and what we are doing about it]' },
      { type: 'text', md: '# Next quarter\n\n- [Goal]\n- [Goal]\n- [Goal]' },
      { type: 'text', md: '# How you can help\n\n- **Introductions:** [the customers, partners or investors we would like to meet]\n- **Hiring:** [the roles we are hiring for]\n\nThank you for your continued support.' },
    ],
  },
  {
    key: 'monthly', name: 'Monthly investor update', period_type: 'month',
    about: 'A short monthly note: a summary, key figures, a revenue chart, wins, setbacks and asks.',
    blocks: (company, label) => [
      { type: 'text', md: 'Good day, Investor,\n\nHere is ' + company + "'s update for **" + label + '**. [One sentence on how the month went.]' },
      { type: 'metrics_table', title: 'Key figures', metrics: ['revenue', 'gross_margin', 'net_income', 'cash'], period: 'month', count: 3 },
      { type: 'chart', title: 'Revenue', metrics: ['revenue'], period: 'month', count: 6 },
      { type: 'text', md: '# Wins\n\n- [Win]\n- [Win]' },
      { type: 'text', md: '# Setbacks\n\n- [What did not go to plan, and what we are doing about it]' },
      { type: 'text', md: '# Asks\n\n- [An introduction, a hire or advice we need]\n\nThank you for your support.' },
    ],
  },
]
