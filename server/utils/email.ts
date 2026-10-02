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

export async function sendLoginEmail(to: string, magicLink: string, otp: string): Promise<void> {
  const text = 'Sign in to Aidi OS.\n\nLink: ' + magicLink + '\n\nOr enter this code: ' + otp +
    '\n\nBoth expire in 10 minutes. If you did not try to sign in, ignore this email.'
  const html = '<div style="font-family:Helvetica,Arial,sans-serif;color:#1f1f1f;max-width:480px">' +
    '<p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b">The Aidi Group</p>' +
    '<h1 style="font-family:Georgia,serif;font-weight:400;color:#0c1a2e">Sign in to Aidi OS</h1>' +
    '<p><a href="' + magicLink + '" style="display:inline-block;background:#0c1a2e;color:#fff;padding:12px 18px;text-decoration:none">Sign in</a></p>' +
    '<p style="color:#6b6b6b">Or enter this code:</p>' +
    '<p style="font-size:28px;letter-spacing:.3em;font-weight:600;color:#0c1a2e">' + otp + '</p>' +
    '<p style="color:#6b6b6b;font-size:13px">Both expire in 10 minutes. If you did not try to sign in, ignore this email.</p></div>'
  await sendEmail({ to, subject: 'Your Aidi OS sign-in code', text, html })
}
