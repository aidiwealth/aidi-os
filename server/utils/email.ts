// Transactional email through Resend. Fails loudly; never reports success it did not get.
export async function sendEmail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const { resendApiKey, emailFrom } = useRuntimeConfig()
  if (!resendApiKey) {
    if (!import.meta.dev) throw new Error('NUXT_RESEND_API_KEY is not set')
    console.warn('[email] dev mode, not sent:\n' + input.subject + '\n' + input.text)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + resendApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: emailFrom, to: [input.to], subject: input.subject, text: input.text, html: input.html })
  })
  if (!res.ok) throw new Error('Resend ' + res.status + ': ' + (await res.text()).slice(0, 300))
}

const BRAND = {
  navy: '#0c1a2e', blue: '#1c547d', ink: '#1f1f1f', inkSoft: '#4a4a4a', inkMute: '#6b6b6b',
  paper: '#ffffff', paper2: '#f5f5f3', rule: '#e7e5e0', soft: '#eef4f9'
}
const logoUrl = (): string => useRuntimeConfig().public.appBaseUrl + '/brand/aidi-wordmark.png'
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Email-safe shell: table layout and inline styles, mirroring the Aidi design (navy, Garamond headings, square corners)
function shell(inner: string, preheader: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${BRAND.paper2};font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:${BRAND.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.paper2};padding:40px 16px;"><tr><td align="center">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:${BRAND.paper};border:1px solid ${BRAND.rule};">
    <tr><td style="padding:28px 36px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="${logoUrl()}" alt="Aidi" width="61" height="24" style="display:block;width:61px;height:24px;"></td>
        <td style="vertical-align:middle;padding:0 12px;"><div style="width:1px;height:20px;background:${BRAND.rule};"></div></td>
        <td style="vertical-align:middle;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-style:italic;font-size:19px;color:${BRAND.navy};">OS</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 36px 34px;">${inner}</td></tr>
    <tr><td style="padding:20px 36px;border-top:1px solid ${BRAND.rule};background:${BRAND.paper2};">
      <p style="margin:0 0 4px;color:${BRAND.inkSoft};font-size:12.5px;line-height:1.5;">The Aidi Group · Internal back office</p>
      <p style="margin:0;font-size:12px;line-height:1.6;"><a href="https://theaidigroup.com" style="color:${BRAND.blue};text-decoration:none;">theaidigroup.com</a></p>
    </td></tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;color:${BRAND.inkMute};font-size:11px;line-height:1.5;text-align:center;">You're receiving this because you have access to Aidi OS. © The Aidi Group</p>
</td></tr></table></body></html>`
}
const h1 = (s: string): string => `<h1 style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.2;letter-spacing:-0.01em;margin:0 0 10px;color:${BRAND.navy};">${s}</h1>`
const para = (s: string): string => `<p style="color:${BRAND.inkSoft};font-size:15px;line-height:1.6;margin:0 0 18px;">${s}</p>`
const button = (label: string, href: string): string => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;"><tr><td style="background:${BRAND.navy};"><a href="${href}" style="display:inline-block;padding:13px 26px;color:#fff;text-decoration:none;font-size:14px;font-weight:500;">${label}</a></td></tr></table>`
const divider = (): string => `<hr style="border:none;border-top:1px solid ${BRAND.rule};margin:22px 0;">`

export async function sendLoginEmail(to: string, magicLink: string, otp: string): Promise<void> {
  const text = 'Sign in to Aidi OS.\n\nSign-in link: ' + magicLink + '\n\nOr enter this code: ' + otp +
    '\n\nBoth expire in 10 minutes. If you did not try to sign in, ignore this email.'
  const html = shell(
    h1('Sign in to Aidi OS') +
    para('Use the button to sign in, or enter the code below on the sign-in screen. Both expire in 10 minutes.') +
    button('Sign in to Aidi OS →', magicLink) +
    `<p style="color:${BRAND.inkMute};font-size:13px;margin:24px 0 10px;">Or enter this code:</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px;"><tr><td style="background:${BRAND.soft};border:1px solid ${BRAND.rule};padding:16px 26px;">` +
    `<span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;letter-spacing:0.32em;font-weight:600;color:${BRAND.navy};">${otp}</span></td></tr></table>` +
    divider() +
    `<p style="color:${BRAND.inkMute};font-size:12.5px;line-height:1.5;margin:0;">If you didn't try to sign in, you can ignore this email. No one can get in without this code.</p>`,
    'Your Aidi OS code is ' + otp)
  await sendEmail({ to, subject: 'Your Aidi OS sign-in code', text, html })
}

const LABEL: Record<string, string> = { prioritise: 'Prioritise', review: 'Review', likely_pass: 'Likely pass' }

// To the partners: every new pitch, with the AI screening when it succeeded.
export async function sendPitchAlert(p: { pitchId: string; company: string; oneLiner: string; score: number | null; recommendation: string | null; summary: string[] }): Promise<void> {
  const to = useRuntimeConfig().pitchNotifyTo.split(',').map((s) => s.trim()).filter(Boolean)
  if (!to.length) { console.warn('[email] NUXT_PITCH_NOTIFY_TO not set: no pitch alert sent for ' + p.pitchId); return }
  const link = useRuntimeConfig().public.appBaseUrl + '/deals/' + p.pitchId
  const head = p.score === null ? 'Screening failed — review by hand' : LABEL[p.recommendation ?? ''] + ' · ' + p.score + '/100'
  const lines = p.summary.map((s) => para(esc(s))).join('')
  const html = shell(
    `<p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.inkMute};margin:0 0 8px;">New pitch · ${esc(head)}</p>` +
    h1(esc(p.company)) + para(esc(p.oneLiner)) + lines + button('Open in Aidi OS →', link) + divider() +
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
    para('We have received the pitch for <strong>' + esc(company) + '</strong>. A partner at Aidi Ventures reads every submission, and we will be in touch if there is a fit.') +
    para('If anything changes, such as a new deck or a funding update, reply to the address on aidiventures.com.'),
    'We received your pitch')
  await sendEmail({ to, subject: 'We received your pitch — Aidi Ventures', text: 'Thank you, ' + first + '. We have received the pitch for ' + company + '. A partner at Aidi Ventures reads every submission, and we will be in touch if there is a fit.', html })
}

// Invitation to Aidi OS. Sign-in stays passwordless: they request a code at the sign-in page.
export async function sendInviteEmail(to: string, name: string, invitedBy: string): Promise<void> {
  const first = esc(name.split(' ')[0] ?? name)
  const link = useRuntimeConfig().public.appBaseUrl + '/login'
  const html = shell(
    h1('Welcome to Aidi OS, ' + first) +
    para('You have been given access to Aidi OS, the internal back office of The Aidi Group, by ' + esc(invitedBy) + '.') +
    para('To sign in, open the link below and enter this email address. We will send you a one-time code; there is no password.') +
    button('Go to Aidi OS →', link) + divider() +
    `<p style="color:${BRAND.inkMute};font-size:12.5px;line-height:1.5;margin:0;">If you were not expecting this, you can ignore this email.</p>`,
    'You have access to Aidi OS')
  await sendEmail({ to, subject: 'You have access to Aidi OS', text: 'Welcome to Aidi OS, ' + first + '. You have been given access by ' + invitedBy + '. Sign in at ' + link + ' with this email address; we will send you a one-time code.', html })
}
