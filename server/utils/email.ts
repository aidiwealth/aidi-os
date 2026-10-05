// Transactional email through Resend. Fails loudly; never reports success it did not get.
export async function sendEmail(input: { to: string; subject: string; text: string; html: string; fromName?: string }): Promise<void> {
  const { resendApiKey } = useRuntimeConfig()
  // Brand: the workspace's (or, before sign-in, the address's) name, logo, links and sender
  const b = brands()[await resolveBrand()]
  const org = currentOrgId() ? await currentOrg() : null
  const firm = org?.settings.public_name || org?.name || b.name, orgName = org?.name || b.name
  const fill = (s: string): string => s.replaceAll('{{FIRM}}', firm).replaceAll('{{ORG}}', orgName).replaceAll('{{APP_URL}}', b.url).replaceAll('{{PRODUCT}}', b.name).replaceAll('{{BRAND_LOGO}}', b.logoHtml)
    .replaceAll('{{BRAND_FOOTER}}', b.footerHtml).replaceAll('{{BRAND_SMALLPRINT}}', b.smallprint)
  input = { to: input.to, subject: fill(input.subject), text: fill(input.text), html: fill(input.html) }
  if (!resendApiKey) {
    if (!import.meta.dev) throw new Error('NUXT_RESEND_API_KEY is not set')
    console.warn('[email] dev mode, not sent:\n' + input.subject + '\n' + input.text)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + resendApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: input.fromName ? '"' + input.fromName.replace(/["<>\\\r\n]/g, '').slice(0, 80) + '" <' + (b.from.match(/<([^>]+)>/)?.[1] ?? b.from) + '>' : b.from, to: [input.to], subject: input.subject, text: input.text, html: input.html })
  })
  if (!res.ok) throw new Error('Resend ' + res.status + ': ' + (await res.text()).slice(0, 300))
}

const BRAND = {
  navy: '#0c1a2e', blue: '#1c547d', ink: '#1f1f1f', inkSoft: '#4a4a4a', inkMute: '#6b6b6b',
  paper: '#ffffff', paper2: '#f5f5f3', rule: '#e7e5e0', soft: '#eef4f9'
}
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Email-safe shell: table layout and inline styles, mirroring the Aidi design (navy, Garamond headings, square corners)
function shell(inner: string, preheader: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${BRAND.paper2};font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:${BRAND.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.paper2};padding:40px 16px;"><tr><td align="center">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:${BRAND.paper};border:1px solid ${BRAND.rule};">
    <tr><td style="padding:28px 36px 0;">
      {{BRAND_LOGO}}
    </td></tr>
    <tr><td style="padding:26px 36px 34px;">${inner}</td></tr>
    <tr><td style="padding:20px 36px;border-top:1px solid ${BRAND.rule};background:${BRAND.paper2};">
      {{BRAND_FOOTER}}
    </td></tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;color:${BRAND.inkMute};font-size:11px;line-height:1.5;text-align:center;">{{BRAND_SMALLPRINT}}</p>
</td></tr></table></body></html>`
}
const h1 = (s: string): string => `<h1 style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.2;letter-spacing:-0.01em;margin:0 0 10px;color:${BRAND.navy};">${s}</h1>`
const para = (s: string): string => `<p style="color:${BRAND.inkSoft};font-size:15px;line-height:1.6;margin:0 0 18px;">${s}</p>`
const button = (label: string, href: string): string => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;"><tr><td style="background:${BRAND.navy};"><a href="${href}" style="display:inline-block;padding:13px 26px;color:#fff;text-decoration:none;font-size:14px;font-weight:500;">${label}</a></td></tr></table>`
const divider = (): string => `<hr style="border:none;border-top:1px solid ${BRAND.rule};margin:22px 0;">`

export async function sendLoginEmail(to: string, magicLink: string, otp: string): Promise<void> {
  const text = 'Sign in to {{PRODUCT}}.\n\nSign-in link: ' + magicLink + '\n\nOr enter this code: ' + otp +
    '\n\nBoth expire in 10 minutes. If you did not try to sign in, ignore this email.'
  const html = shell(
    h1('Sign in to {{PRODUCT}}') +
    para('Use the button to sign in, or enter the code below on the sign-in screen. Both expire in 10 minutes.') +
    button('Sign in to {{PRODUCT}} →', magicLink) +
    `<p style="color:${BRAND.inkMute};font-size:13px;margin:24px 0 10px;">Or enter this code:</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px;"><tr><td style="background:${BRAND.soft};border:1px solid ${BRAND.rule};padding:16px 26px;">` +
    `<span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;letter-spacing:0.32em;font-weight:600;color:${BRAND.navy};">${otp}</span></td></tr></table>` +
    divider() +
    `<p style="color:${BRAND.inkMute};font-size:12.5px;line-height:1.5;margin:0;">If you didn't try to sign in, you can ignore this email. No one can get in without this code.</p>`,
    'Your {{PRODUCT}} code is ' + otp)
  await sendEmail({ to, subject: 'Your {{PRODUCT}} sign-in code', text, html })
}

const LABEL: Record<string, string> = { prioritise: 'Prioritise', review: 'Review', likely_pass: 'Likely pass' }

// To the partners: every new pitch, with the AI screening when it succeeded.
export async function sendPitchAlert(p: { pitchId: string; company: string; oneLiner: string; score: number | null; recommendation: string | null; summary: string[] }): Promise<void> {
  const to = (await orgNotifyEmails())
  if (!to.length) { console.warn('[email] NUXT_PITCH_NOTIFY_TO not set: no pitch alert sent for ' + p.pitchId); return }
  const link = '{{APP_URL}}' + '/deals/' + p.pitchId
  const head = p.score === null ? 'Screening failed — review by hand' : LABEL[p.recommendation ?? ''] + ' · ' + p.score + '/100'
  const lines = p.summary.map((s) => para(esc(s))).join('')
  const html = shell(
    `<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.inkMute};margin:0 0 8px;">New pitch · ${esc(head)}</p>` +
    h1(esc(p.company)) + para(esc(p.oneLiner)) + lines + button('Open in {{PRODUCT}} →', link) + divider() +
    `<p style="color:${BRAND.inkMute};font-size:12.5px;line-height:1.5;margin:0;">AI screening is advice only. A partner makes every decision.</p>`,
    'New pitch: ' + p.company)
  const text = 'New pitch: ' + p.company + '\n' + head + '\n\n' + p.oneLiner + '\n\n' + p.summary.join('\n') + '\n\n' + link
  for (const addr of to) await sendEmail({ to: addr, subject: 'New pitch: ' + p.company + ' (' + head + ')', text, html })
}

// To the founder: a short receipt, so a pitch never disappears into silence.
export async function sendPitchReceipt(to: string, name: string, company: string): Promise<void> {
  const first = esc(name.split(' ')[0] ?? name)
  const html = shell(
    h1('Thank you, ' + first) +
    para('We have received the pitch for <strong>' + esc(company) + '</strong>. A partner at {{FIRM}} reads every submission, and we will be in touch if there is a fit.') +
    para('If anything changes, such as a new deck or a funding update, let {{FIRM}} know through the website where you pitched.'),
    'We received your pitch')
  await sendEmail({ to, subject: 'We received your pitch — {{FIRM}}', text: 'Thank you, ' + first + '. We have received the pitch for ' + company + '. A partner at {{FIRM}} reads every submission, and we will be in touch if there is a fit.', html })
}

// Invitation to {{PRODUCT}}. Sign-in stays passwordless: they request a code at the sign-in page.
export async function sendInviteEmail(to: string, name: string, invitedBy: string): Promise<void> {
  const first = esc(name.split(' ')[0] ?? name)
  const link = '{{APP_URL}}' + '/login'
  const html = shell(
    h1('Welcome to {{PRODUCT}}, ' + first) +
    para('You have been given access to {{PRODUCT}} by ' + esc(invitedBy) + '.') +
    para('To sign in, open the link below and enter this email address. We will send you a one-time code; there is no password.') +
    button('Go to {{PRODUCT}} →', link) + divider() +
    `<p style="color:${BRAND.inkMute};font-size:12.5px;line-height:1.5;margin:0;">If you were not expecting this, you can ignore this email.</p>`,
    'You have access to {{PRODUCT}}')
  await sendEmail({ to, subject: 'You have access to {{PRODUCT}}', text: 'Welcome to {{PRODUCT}}, ' + first + '. You have been given access by ' + invitedBy + '. Sign in at ' + link + ' with this email address; we will send you a one-time code.', html })
}

// To a founder: their personal link for the month's update. No login needed.
export async function sendReportRequest(to: string, founderName: string, company: string, monthLabel: string, link: string, fromName: string): Promise<void> {
  const first = esc(founderName.split(' ')[0] ?? founderName)
  const html = shell(
    h1('Your ' + esc(monthLabel) + ' update') +
    para('Hi ' + first + ', it is time for the ' + esc(company) + ' monthly update for {{FIRM}}. It takes about five minutes: type your key figures, or upload your spreadsheet and we will fill them in for you.') +
    para('You can save and come back to finish. The link is personal to you and works for ' + LINK_DAYS + ' days.') +
    button('Open your update →', link) + divider() +
    `<p style="color:${BRAND.inkMute};font-size:12.5px;line-height:1.5;margin:0;">Sent by ${esc(fromName)} at {{FIRM}}. Please do not forward this link.</p>`,
    company + ' — ' + monthLabel + ' update')
  await sendEmail({ to, subject: company + ': your ' + monthLabel + ' update for {{FIRM}}', text: 'Hi ' + first + ', please complete the ' + company + ' ' + monthLabel + ' update for {{FIRM}}: ' + link + ' (works for ' + LINK_DAYS + ' days; you can save and continue).', html })
}

// To the partners: a founder has submitted their update.
export async function sendReportSubmittedAlert(companyId: string, company: string, monthLabel: string): Promise<void> {
  const to = (await orgNotifyEmails())
  if (!to.length) return
  const link = '{{APP_URL}}' + '/portfolio/' + companyId
  const html = shell(h1(esc(company) + ' sent their ' + esc(monthLabel) + ' update') + button('See it in {{PRODUCT}} →', link), company + ' update received')
  for (const addr of to) await sendEmail({ to: addr, subject: company + ': ' + monthLabel + ' update received', text: company + ' submitted their ' + monthLabel + ' update. ' + link, html })
}

// To a client: an update on their job, with their personal link.
export async function sendJobUpdate(to: string, contactName: string, jobTitle: string, headline: string, body: string, link: string): Promise<void> {
  const first = esc(contactName.split(' ')[0] ?? contactName)
  const html = shell(
    `<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.inkMute};margin:0 0 8px;">${esc(jobTitle)}</p>` +
    h1(esc(headline)) + para('Hi ' + first + ',') + (body ? para(esc(body).replace(/\n/g, '<br>')) : '') +
    button('Open your request →', link) + divider() +
    `<p style="color:${BRAND.inkMute};font-size:12.5px;line-height:1.5;margin:0;">This link is personal to you. You can reply and upload documents there.</p>`,
    headline)
  await sendEmail({ to, subject: jobTitle + ': ' + headline, text: 'Hi ' + first + ',\n\n' + headline + (body ? '\n\n' + body : '') + '\n\nOpen your request: ' + link, html })
}

// To the team: a client replied or uploaded something.
export async function sendJobClientActivity(ownerEmail: string | null, jobId: string, client: string, jobTitle: string, what: string, body: string): Promise<void> {
  const to = ownerEmail ? [ownerEmail] : (await orgNotifyEmails())
  if (!to.length) return
  const link = '{{APP_URL}}' + '/services/' + jobId
  const html = shell(h1(esc(client) + ' ' + esc(what)) + para(esc(jobTitle)) + (body ? para(esc(body).replace(/\n/g, '<br>')) : '') + button('Open the job →', link), client + ' ' + what)
  for (const addr of to) await sendEmail({ to: addr, subject: client + ' ' + what + ' — ' + jobTitle, text: client + ' ' + what + '\n\n' + body + '\n\n' + link, html })
}

// Compliance reminders: one email per person listing what is due soon or overdue.
export async function sendComplianceDigest(to: string, items: { id: string; title: string; entity: string; next_due: string; days_left: number; kind: string }[]): Promise<void> {
  const base = '{{APP_URL}}'
  const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const rows = items.sort((a, b) => a.next_due.localeCompare(b.next_due)).map((i) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};"><a href="${base}/compliance/${i.id}" style="color:${BRAND.navy};font-weight:500;text-decoration:none;">${esc(i.title)}</a>` +
    `<div style="font-size:12.5px;color:${BRAND.inkMute};">${esc(i.entity)}</div></td>` +
    `<td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;font-size:13px;color:${i.kind === 'overdue' ? '#b42318' : BRAND.inkSoft};">` +
    (i.kind === 'overdue' ? 'Overdue since ' + day(i.next_due) : 'Due ' + day(i.next_due) + (i.days_left === 0 ? ' (today)' : ' (' + i.days_left + ' days)')) + '</td></tr>').join('')
  const overdue = items.filter((i) => i.kind === 'overdue').length
  const html = shell(h1(overdue ? overdue + ' overdue, ' + (items.length - overdue) + ' due soon' : items.length + ' compliance item' + (items.length === 1 ? '' : 's') + ' due soon') +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">${rows}</table>` + button('Open the compliance calendar →', base + '/compliance'), 'Compliance reminders')
  const text = items.map((i) => '- ' + i.title + ' (' + i.entity + '): ' + (i.kind === 'overdue' ? 'OVERDUE since ' : 'due ') + i.next_due).join('\n') + '\n\n' + base + '/compliance'
  await sendEmail({ to, subject: (overdue ? 'Overdue: ' : 'Due soon: ') + items.length + ' compliance item' + (items.length === 1 ? '' : 's'), text, html })
}

// To a signatory: a resolution needs their approval.
export async function sendResolutionCirculated(to: string, name: string, resolutionId: string, title: string, entity: string, required: number): Promise<void> {
  const first = esc(name.split(' ')[0] ?? name)
  const link = '{{APP_URL}}' + '/governance/resolutions/' + resolutionId
  const html = shell(
    `<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.inkMute};margin:0 0 8px;">${esc(entity)}</p>` +
    h1(esc(title)) + para('Hi ' + first + ', this has been circulated for your approval as a signatory of ' + esc(entity) + '. It needs ' + required + ' approval' + (required === 1 ? '' : 's') + '.') +
    button('Review and respond →', link), 'For your approval: ' + title)
  await sendEmail({ to, subject: 'For your approval: ' + title + ' (' + entity + ')', text: 'Hi ' + first + ', "' + title + '" for ' + entity + ' needs your approval: ' + link, html })
}

// Credit reminders to the partners: instalments due soon, loans in arrears, covenants due.
export async function sendCreditDigest(to: string, items: { line: string; link: string }[]): Promise<void> {
  const base = '{{APP_URL}}'
  const html = shell(h1(items.length + ' credit item' + (items.length === 1 ? '' : 's') + ' to look at') +
    items.map((i) => para('<a href="' + i.link + '" style="color:' + BRAND.navy + ';">' + esc(i.line) + '</a>')).join('') + button('Open Credit →', base + '/credit'), 'Credit reminders')
  await sendEmail({ to, subject: 'Credit: ' + items.length + ' item' + (items.length === 1 ? '' : 's') + ' due or late', text: items.map((i) => '- ' + i.line).join('\n') + '\n\n' + base + '/credit', html })
}

// An invoice to a customer's billing contact: line items, total, due date and how to pay.
export async function sendInvoiceEmail(inv: { number: string; customer: string; issue_date: string; due_date: string; currency: string; lines: { description: string; quantity: number; unit_amount: number; amount: number }[]; amount: string; bill_to: { name: string; email: string } },
  s: { issuer_name: string; issuer_address: string; issuer_email: string; payment_instructions: string }, opts: { payUrl?: string; reminder?: boolean; failedCharge?: boolean } = {}): Promise<void> {
  const money = (v: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: inv.currency }).format(Number(v))
  const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const rows = inv.lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND.rule};font-size:14px;">${esc(l.description)}${l.quantity !== 1 ? ' × ' + l.quantity : ''}</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.rule};text-align:right;font-size:14px;">${money(l.amount)}</td></tr>`).join('')
  const html = shell(
    `<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.inkMute};margin:0 0 8px;">Invoice ${esc(inv.number)}</p>` +
    h1(money(inv.amount) + ' due ' + day(inv.due_date)) + para('Hi ' + esc(inv.bill_to.name.split(' ')[0] ?? inv.bill_to.name) + ', ' +
      (opts.failedCharge ? 'we could not charge your saved card for this invoice from ' + esc(s.issuer_name) + ' for ' + esc(inv.customer) + '. Please pay it below to keep your workspace active.'
        : opts.reminder ? 'a reminder that this invoice from ' + esc(s.issuer_name) + ' for ' + esc(inv.customer) + ' is now overdue.'
        : 'here is your invoice from ' + esc(s.issuer_name) + ' for ' + esc(inv.customer) + '.')) +
    (opts.payUrl ? button('Pay ' + money(inv.amount) + ' online →', opts.payUrl) : '') +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;">${rows}<tr><td style="padding:10px 0;font-weight:600;">Total</td><td style="padding:10px 0;text-align:right;font-weight:600;">${money(inv.amount)}</td></tr></table>` +
    divider() + `<p style="font-size:13px;color:${BRAND.inkSoft};line-height:1.6;margin:0 0 12px;white-space:pre-wrap;"><strong>How to pay</strong><br>${esc(s.payment_instructions)}</p>` +
    `<p style="font-size:12.5px;color:${BRAND.inkMute};line-height:1.5;margin:0;">Issued ${day(inv.issue_date)} by ${esc(s.issuer_name)}${s.issuer_address ? ', ' + esc(s.issuer_address) : ''}. Admins can also view and print it in {{PRODUCT}} under Settings, Billing.${s.issuer_email ? ' Questions: ' + esc(s.issuer_email) : ''}</p>`,
    'Invoice ' + inv.number + ': ' + money(inv.amount))
  const text = 'Invoice ' + inv.number + ' from ' + s.issuer_name + ' for ' + inv.customer + '\n\n' + inv.lines.map((l) => '- ' + l.description + ': ' + money(l.amount)).join('\n') + '\nTotal: ' + money(inv.amount) + '\nDue: ' + day(inv.due_date) + '\n\nHow to pay:\n' + s.payment_instructions
  const subject = (opts.failedCharge ? 'Payment failed: ' : opts.reminder ? 'Reminder: ' : '') + 'Invoice ' + inv.number + ' from ' + s.issuer_name + ': ' + money(inv.amount)
  await sendEmail({ to: inv.bill_to.email, subject, text: text + (opts.payUrl ? '\n\nPay online: ' + opts.payUrl : ''), html })
}

// Receipt after an online payment.
export async function sendPaymentReceiptEmail(inv: { number: string; customer: string; currency: string; amount: string; bill_to: { name: string; email: string } }, issuer: string): Promise<void> {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: inv.currency }).format(Number(inv.amount))
  const html = shell(h1('Payment received') + para('Thank you, ' + esc(inv.bill_to.name.split(' ')[0] ?? inv.bill_to.name) + '. We have received ' + money + ' for invoice ' + esc(inv.number) + ' (' + esc(inv.customer) + ').') +
    `<p style="color:${BRAND.inkMute};font-size:12.5px;line-height:1.5;margin:0;">Admins can view the paid invoice in {{PRODUCT}} under Settings, Billing. Issued by ${esc(issuer)}.</p>`, 'Payment received for ' + inv.number)
  await sendEmail({ to: inv.bill_to.email, subject: 'Payment received: invoice ' + inv.number, text: 'We have received ' + money + ' for invoice ' + inv.number + '. Thank you.', html })
}

// Capital call or distribution notice to an LP.
export async function sendFundNoticeEmail(n: { to: string; lp: string; fund: string; kind: 'call' | 'distribution'; number: number; amount: number; currency: string; due: string; purpose: string | null; admin: string | null; adminUrl: string | null; portal: string }): Promise<void> {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: n.currency }).format(n.amount)
  const day = new Date(n.due + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const call = n.kind === 'call'
  const title = (call ? 'Capital call ' : 'Distribution ') + n.number + ': ' + n.fund
  const html = shell(
    `<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.inkMute};margin:0 0 8px;">${esc(n.fund)}</p>` +
    h1(call ? money + ' due ' + day : money + ' to be paid on ' + day) +
    para('Dear ' + esc(n.lp) + ', ' + (call ? 'this is capital call ' + n.number + ' for your commitment to ' + esc(n.fund) + '.' : 'we are making distribution ' + n.number + ' from ' + esc(n.fund) + '. Your share is shown above.')) +
    (n.purpose ? para(esc(n.purpose)) : '') +
    (n.admin ? `<p style="font-size:13px;color:${BRAND.inkSoft};line-height:1.6;margin:0 0 14px;">${call ? 'Your official notice and payment details come from' : 'The payment is made by'} <strong>${esc(n.admin)}</strong>${n.adminUrl ? ` (<a href="${esc(n.adminUrl)}" style="color:${BRAND.blue};">open ${esc(n.admin)}</a>)` : ''}.</p>` : '') +
    button('View your investor portal →', n.portal) +
    `<p style="font-size:12.5px;color:${BRAND.inkMute};margin:0;">Sent by {{FIRM}}. Your portal shows your commitment, calls, distributions and fund performance.</p>`, title)
  await sendEmail({ to: n.to, subject: title, text: title + '\n\nAmount: ' + money + '\nDate: ' + day + (n.purpose ? '\n\n' + n.purpose : '') + (n.admin ? '\n\nOfficial notices, payments and statements: ' + n.admin + (n.adminUrl ? ' (' + n.adminUrl + ')' : '') : '') + '\n\nYour investor portal: ' + n.portal, html })
}

// Investor portal link for an LP.
export async function sendLpPortalEmail(to: string, name: string, link: string): Promise<void> {
  const html = shell(h1('Your investor portal') + para('Dear ' + esc(name) + ', here is your private link to see your commitments, capital calls, distributions and fund performance with {{FIRM}}.') +
    button('Open your investor portal →', link) + `<p style="font-size:12.5px;color:${BRAND.inkMute};margin:0;">The link is personal to you and expires in 180 days.</p>`, 'Your investor portal')
  await sendEmail({ to, subject: 'Your investor portal with {{FIRM}}', text: 'Your investor portal: ' + link, html })
}

// Introduction from a Finvry or Aidi OS user to a listed fund professional, with a copy to the user.
export async function sendIntroEmails(i: { pro: string; proEmail: string; firm: string | null; who: string; whoEmail: string; org: string; message: string }): Promise<void> {
  const html = shell(h1('Introduction request') + para('Hello ' + esc(i.pro) + ', ' + esc(i.who) + ' of ' + esc(i.org) + ' found you in the {{PRODUCT}} fund services directory and would like to talk.') +
    `<div style="border-left:3px solid ${BRAND.blue};padding:8px 14px;margin:0 0 16px;color:${BRAND.ink};white-space:pre-wrap;font-size:14px;line-height:1.6;">${esc(i.message)}</div>` +
    para('Reply to ' + esc(i.who) + ' directly at <a href="mailto:' + esc(i.whoEmail) + '" style="color:' + BRAND.blue + ';">' + esc(i.whoEmail) + '</a>.') +
    `<p style="font-size:12.5px;color:${BRAND.inkMute};margin:0;">{{PRODUCT}} only makes the introduction; any engagement is between you and ${esc(i.org)}.</p>`, 'Introduction request from ' + i.who)
  await sendEmail({ to: i.proEmail, subject: 'Introduction request from ' + i.who + ' (' + i.org + ')', text: i.who + ' of ' + i.org + ' (' + i.whoEmail + ') would like to talk:\n\n' + i.message, html })
  const copy = shell(h1('Your introduction was sent') + para('We have sent your note to ' + esc(i.pro) + (i.firm ? ' at ' + esc(i.firm) : '') + ', with your email address so they can reply to you directly.') +
    `<div style="border-left:3px solid ${BRAND.blue};padding:8px 14px;margin:0 0 16px;color:${BRAND.ink};white-space:pre-wrap;font-size:14px;line-height:1.6;">${esc(i.message)}</div>` +
    `<p style="font-size:12.5px;color:${BRAND.inkMute};margin:0;">Professionals in the directory are independent. {{PRODUCT}} does not provide legal, regulatory, tax or fund administration services.</p>`, 'Introduction sent')
  await sendEmail({ to: i.whoEmail, subject: 'Your introduction to ' + i.pro + ' was sent', text: 'We sent your note to ' + i.pro + '. They will reply to you directly.\n\n' + i.message, html: copy })
}

// Client Services invoice: amount due, line items, pay online and bank transfer details.
export async function sendClientInvoiceEmail(inv: { number: string; currency: string; amount: string; due_date: string; lines: { description: string; quantity: number; amount: number }[]; bill_to: { name: string; email: string }; issuer: { issuer: string; note_top?: string; bank?: Record<string, string> } }, link: string, online: boolean): Promise<void> {
  const money = (v: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: inv.currency }).format(Number(v))
  const day = new Date(inv.due_date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const rows = inv.lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND.rule};font-size:14px;">${esc(l.description)}${l.quantity !== 1 ? ' × ' + l.quantity : ''}</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.rule};text-align:right;font-size:14px;">${money(l.amount)}</td></tr>`).join('')
  const bank = Object.entries(inv.issuer.bank ?? {}).filter(([, v]) => v)
  const html = shell(`<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.inkMute};margin:0 0 8px;">Invoice ${esc(inv.number)} · ${esc(inv.issuer.issuer)}</p>` +
    h1(money(inv.amount) + ' ' + inv.currency + ' due ' + day) + (inv.issuer.note_top ? para(esc(inv.issuer.note_top)) : '') +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;">${rows}<tr><td style="padding:10px 0;font-weight:600;">Amount due</td><td style="padding:10px 0;text-align:right;font-weight:600;">${money(inv.amount)} ${inv.currency}</td></tr></table>` +
    button(online ? 'View and pay online →' : 'View invoice →', link) +
    (bank.length ? `<p style="font-size:13px;color:${BRAND.inkSoft};line-height:1.7;margin:0 0 6px;"><strong>Or pay by bank transfer</strong><br>${bank.map(([k, v]) => esc(k) + ': ' + esc(v)).join('<br>')}<br>Reference: ${esc(inv.number)}</p>` : ''),
    'Invoice ' + inv.number + ': ' + money(inv.amount))
  const text = 'Invoice ' + inv.number + ' from ' + inv.issuer.issuer + '\n' + money(inv.amount) + ' ' + inv.currency + ' due ' + day + '\n\n' + inv.lines.map((l) => '- ' + l.description + ': ' + money(l.amount)).join('\n') + '\n\nView' + (online ? ' and pay' : '') + ': ' + link + (bank.length ? '\n\nBank transfer:\n' + bank.map(([k, v]) => k + ': ' + v).join('\n') + '\nReference: ' + inv.number : '')
  await sendEmail({ to: inv.bill_to.email, subject: 'Invoice ' + inv.number + ' from ' + inv.issuer.issuer + ': ' + money(inv.amount) + ' due ' + day, text, html })
}
export async function sendClientReceiptEmail(inv: { number: string; currency: string; amount: string; bill_to: { name: string; email: string }; issuer: { issuer: string } }): Promise<void> {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: inv.currency }).format(Number(inv.amount))
  const html = shell(h1('Payment received') + para('Thank you. ' + esc(inv.issuer.issuer) + ' has received ' + money + ' for invoice ' + esc(inv.number) + '.'), 'Payment received for ' + inv.number)
  await sendEmail({ to: inv.bill_to.email, subject: 'Payment received: invoice ' + inv.number, text: 'Thank you. We have received ' + money + ' for invoice ' + inv.number + '.', html })
}

// Tax filing information request to a client (no login).
export async function sendInfoRequestEmail(to: string, client: string, company: string, year: number, link: string): Promise<void> {
  const html = shell(`<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.inkMute};margin:0 0 8px;">${esc(company)} · ${year} tax filing</p>` +
    h1('Your ' + year + ' tax filing information') +
    para('Hello ' + esc(client) + ', to prepare ' + esc(company) + '\'s ' + year + ' filings we need some details and documents: company details, shareholders, financial statements, bank accounts and a few questions about related-party payments.') +
    para('It takes about 15 minutes. No account or password is needed: your answers save as you go, and you can come back to the same link.') +
    button('Open the form →', link) + `<p style="font-size:12.5px;color:${BRAND.inkMute};margin:0;">The link is personal to you and expires in 120 days. Reply to this email if you have questions.</p>`, year + ' tax filing information')
  await sendEmail({ to, subject: company + ': information needed for your ' + year + ' tax filing', text: 'Please complete your ' + year + ' tax filing information for ' + company + ': ' + link, html })
}

// Client messages.
export async function sendPortalMessageEmail(to: string, client: string, body: string, link: string | null): Promise<void> {
  const html = shell(h1('A message from {{FIRM}}') + `<div style="border-left:3px solid ${BRAND.blue};padding:8px 14px;margin:0 0 16px;white-space:pre-wrap;font-size:14px;line-height:1.6;">${esc(body)}</div>` +
    (link ? button('Reply in your portal →', link) : para('You can reply to this email.')), 'A message from {{FIRM}}')
  await sendEmail({ to, subject: 'A message from {{FIRM}}' + (client ? ' for ' + client : ''), text: body + (link ? '\n\nReply in your portal: ' + link : ''), html })
}
export async function sendPortalMessageAlert(client: string, who: string, body: string, link: string): Promise<void> {
  const to = await orgNotifyEmails()
  const html = shell(h1(esc(who) + ' (' + esc(client) + ') sent a message') + `<div style="border-left:3px solid ${BRAND.blue};padding:8px 14px;margin:0 0 16px;white-space:pre-wrap;font-size:14px;">${esc(body)}</div>` + button('Open the client →', link), 'Client message')
  for (const addr of to) await sendEmail({ to: addr, subject: 'Message from ' + who + ' (' + client + ')', text: body + '\n\n' + link, html })
}

// A pipeline meeting is coming up.
export async function sendMeetingReminder(to: string, title: string, investor: string | null, startsAt: string, location: string | null, link: string): Promise<void> {
  const when = new Date(startsAt).toUTCString().replace(':00 GMT', ' UTC')
  const html = shell(h1('Coming up: ' + esc(title)) + para((investor ? 'With <b>' + esc(investor) + '</b>. ' : '') + 'Starts ' + esc(when) + '.' + (location ? '<br>' + esc(location) : '')) + button('Open the pipeline →', link), 'Meeting reminder')
  await sendEmail({ to, subject: 'Reminder: ' + title, text: title + (investor ? ' with ' + investor : '') + ' starts ' + when + (location ? '\n' + location : '') + '\n' + link, html })
}

// Someone opened a shared financials link.
export async function sendShareViewedEmail(to: string, title: string, link: string): Promise<void> {
  const html = shell(h1('Your shared financials were viewed') + para('Someone just opened <b>' + esc(title) + '</b>.') + button('See your share links →', link) +
    `<p style="font-size:12.5px;color:${BRAND.inkMute};margin:0;">You hear about views at most once an hour per link.</p>`, 'Shared financials viewed')
  await sendEmail({ to, subject: 'Viewed: ' + title, text: 'Someone opened your shared financials "' + title + '". ' + link, html })
}

// An investor update: a short preview and the personal link to read it.
export async function sendInvestorUpdateEmail(to: string, name: string, company: string, title: string, body: string, link: string): Promise<void> {
  const preview = body.replace(/[#*_>`-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 320)
  const html = shell(`<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.inkMute};margin:0 0 8px;">${esc(company)} · Investor update</p>` + h1(esc(title)) +
    para('Hi ' + esc(name.split(' ')[0] ?? name) + ',') + para(esc(preview) + (body.length > 320 ? '…' : '')) + button('Read the full update →', link), title)
  await sendEmail({ to, subject: title, text: 'Hi ' + name + ',\n\n' + preview + '\n\nRead the full update: ' + link, html })
}

// Wallet and billing notices (low balance, charge failed, plan moved to Free, service paused, transfer to confirm).
export async function sendWalletNotice(to: string, subject: string, heading: string, body: string, cta: string, link: string): Promise<void> {
  const html = shell(h1(esc(heading)) + para(esc(body)) + button(cta, link), heading)
  await sendEmail({ to, subject, text: heading + '\n\n' + body + '\n\n' + cta + ': ' + link, html })
}
