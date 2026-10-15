// Where notices come from: the Gmail mailboxes that send them and the senders their Gmail filter picks up. Kept in the
// workspace settings so an admin can change them; the defaults are only a starting point.
export const DEFAULT_NOTICE_MAILBOXES = ['gbolademmanuel@aidiventures.com']
export const DEFAULT_NOTICE_SENDERS = ['bizee.com', 'incfile.com', 'delaware.gov', 'irs.gov', 'sos.ca.gov']
export async function noticeSettings(): Promise<{ mailboxes: string[]; senders: string[] }> {
  const s = (await currentOrg())?.settings as Record<string, unknown> | undefined
  const list = (v: unknown, d: string[]) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : d)
  return { mailboxes: list(s?.notice_mailboxes, DEFAULT_NOTICE_MAILBOXES), senders: list(s?.notice_senders, DEFAULT_NOTICE_SENDERS) }
}
// A sender matches when the address or its domain (or a parent domain) is on the list, e.g. "irs.gov" matches notices@irs.gov.
export function senderKnown(email: string, senders: string[]): boolean {
  const e = email.toLowerCase().trim(), dom = e.split('@')[1] ?? ''
  return senders.some((s) => { const x = s.toLowerCase().trim(); return x.includes('@') ? x === e : dom === x || dom.endsWith('.' + x) })
}
