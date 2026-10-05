// iCalendar (.ics): reading invites and calendar feeds, writing events, and calendar links.
export interface IcsEvent { uid: string | null; title: string; starts_at: string; ends_at: string; location: string | null; description: string | null; emails: string[]; organizer: string | null }
const unfold = (s: string) => s.replace(/\r?\n[ \t]/g, '')
const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const p = Object.fromEntries(f.formatToParts(new Date(guess)).map((x) => [x.type, x.value]))
    const asTz = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
    return new Date(guess - (asTz - guess))
  } catch { return new Date(guess) }
}
function parseDate(params: string, v: string): { d: Date; allDay: boolean } | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (!m[4]) return { d: new Date(Date.UTC(y, mo - 1, d, 9, 0, 0)), allDay: true }
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6])]
  if (m[7]) return { d: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false }
  const tz = params.match(/TZID=([^;:]+)/)?.[1]
  return { d: tz ? zonedToUtc(y, mo, d, h, mi, s, tz.replace(/^"|"$/g, '')) : new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false }
}
export function parseIcs(text: string, limit = 2000): IcsEvent[] {
  const out: IcsEvent[] = []
  for (const block of unfold(text).split('BEGIN:VEVENT').slice(1, limit + 1)) {
    const body = block.split('END:VEVENT')[0] ?? ''
    const ev: Partial<IcsEvent> & { emails: string[] } = { emails: [] }
    let start: { d: Date; allDay: boolean } | null = null, end: { d: Date; allDay: boolean } | null = null, cancelled = false
    for (const line of body.split(/\r?\n/)) {
      const i = line.indexOf(':'); if (i < 0) continue
      const head = line.slice(0, i), val = line.slice(i + 1), [name, ...ps] = head.split(';'), params = ps.join(';'), key = (name ?? '').toUpperCase()
      if (key === 'UID') ev.uid = val.trim().slice(0, 300)
      else if (key === 'SUMMARY') ev.title = unesc(val).trim().slice(0, 200)
      else if (key === 'LOCATION') ev.location = unesc(val).trim().slice(0, 500) || null
      else if (key === 'DESCRIPTION') ev.description = unesc(val).trim().slice(0, 3000) || null
      else if (key === 'DTSTART') start = parseDate(params, val.trim())
      else if (key === 'DTEND') end = parseDate(params, val.trim())
      else if (key === 'STATUS' && /CANCELLED/i.test(val)) cancelled = true
      else if (key === 'ATTENDEE' || key === 'ORGANIZER') { const e = val.replace(/^mailto:/i, '').trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { ev.emails.push(e); if (key === 'ORGANIZER') ev.organizer = e } }
    }
    if (!start || cancelled) continue
    const endD = end?.d && end.d > start.d ? end.d : new Date(start.d.getTime() + (start.allDay ? 3600e3 : 1800e3))
    out.push({ uid: ev.uid ?? null, title: ev.title || 'Meeting', starts_at: start.d.toISOString(), ends_at: endD.toISOString(), location: ev.location ?? null, description: ev.description ?? null, emails: [...new Set(ev.emails)], organizer: ev.organizer ?? null })
  }
  return out
}
const icsDate = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1')
const fold = (line: string) => { const out: string[] = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74) } out.push(s); return out.join('\r\n') }
export interface CalEvent { id: string; title: string; starts_at: string; ends_at: string; location: string | null; notes: string | null; remind_minutes?: number | null; uid?: string | null }
export function buildIcs(events: CalEvent[], calName?: string): string {
  const now = icsDate(new Date().toISOString())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Finvry//Pipeline//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  if (calName) lines.push('X-WR-CALNAME:' + icsText(calName))
  for (const e of events) {
    lines.push('BEGIN:VEVENT', 'UID:' + (e.uid || e.id + '@finvry.com'), 'DTSTAMP:' + now, 'DTSTART:' + icsDate(e.starts_at), 'DTEND:' + icsDate(e.ends_at), 'SUMMARY:' + icsText(e.title))
    if (e.location) lines.push('LOCATION:' + icsText(e.location))
    if (e.notes) lines.push('DESCRIPTION:' + icsText(e.notes))
    if (e.remind_minutes) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(e.title), 'TRIGGER:-PT' + e.remind_minutes + 'M', 'END:VALARM')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
export function calendarLinks(e: CalEvent): { google: string; outlook: string } {
  const q = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&')
  return { google: 'https://calendar.google.com/calendar/render?' + q({ action: 'TEMPLATE', text: e.title, dates: icsDate(e.starts_at) + '/' + icsDate(e.ends_at), details: e.notes ?? '', location: e.location ?? '' }),
    outlook: 'https://outlook.live.com/calendar/0/deeplink/compose?' + q({ path: '/calendar/action/compose', rru: 'addevent', subject: e.title, startdt: e.starts_at, enddt: e.ends_at, body: e.notes ?? '', location: e.location ?? '' }) }
}
// Private calendar addresses we fetch from (no other hosts): Google, iCloud, Outlook, Yahoo, Fastmail, Proton.
const OK_HOSTS = [/^calendar\.google\.com$/, /^([a-z0-9-]+\.)*icloud\.com$/, /^outlook\.(office365|live)\.com$/, /^outlook\.office\.com$/, /^([a-z0-9-]+\.)*calendar\.yahoo\.com$/, /^([a-z0-9-]+\.)*fastmail\.com$/, /^calendar\.proton\.me$/]
export function calendarUrlOk(raw: string): string | null {
  try { const u = new URL(raw.trim().replace(/^webcal:/i, 'https:')); if (u.protocol !== 'https:' || !OK_HOSTS.some((r) => r.test(u.hostname))) return null; return u.toString() } catch { return null }
}
// Match calendar events to pipeline investors: attendee email = contact email, or the investor's name in the title.
export function matchDeal(ev: IcsEvent, deals: { id: string; investor: string; contact_email: string | null; contact_name: string | null }[]): { id: string; why: string } | null {
  const byMail = deals.find((d) => d.contact_email && ev.emails.includes(d.contact_email.toLowerCase()))
  if (byMail) return { id: byMail.id, why: 'attendee ' + byMail.contact_email }
  const t = ev.title.toLowerCase()
  const byName = deals.find((d) => d.investor.length > 2 && t.includes(d.investor.toLowerCase()))
  if (byName) return { id: byName.id, why: 'title mentions ' + byName.investor }
  const dom = deals.find((d) => { const dd = d.contact_email?.split('@')[1]; return !!dd && !/gmail|yahoo|outlook|hotmail|icloud/.test(dd) && ev.emails.some((e) => e.endsWith('@' + dd)) })
  if (dom) return { id: dom.id, why: 'someone from ' + dom.contact_email!.split('@')[1] }
  return null
}
