// Meeting minutes: who met, about which company, what was decided and who does what next. AI turns rough notes into
// clean minutes (summary, minutes, decisions and action items) using only what was written.
export const MEETING_KINDS: Record<string, string> = { team: 'Team meeting', board: 'Board meeting', investor: 'Investor meeting', client: 'Client meeting', partner: 'Partner meeting', one_on_one: 'One-to-one', other: 'Other' }
export interface MeetingAction { text: string; owner_id?: string | null; owner?: string | null; due?: string | null; done?: boolean }

export async function draftMinutes(input: { title: string; kind: string; entity: string | null; held_at: string; attendees: string[]; team: string[]; guests: string; agenda: string; notes: string; ref: string }): Promise<{ summary: string; minutes: string; decisions: string; actions: { text: string; owner: string | null; due: string | null }[] }> {
  const { z } = await import('zod')
  const { output } = await runAiTool({ task: 'meeting_minutes', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'minutes-v2', inputRef: input.ref,
    system: 'You write clear, professional meeting minutes for an investment and family-office team. Use only what is in the notes and agenda: never invent facts, figures, names, decisions or deadlines. Plain English, past tense, third person. ' +
      'Minutes: one "### " subheading per topic (a short title, e.g. "### Aidi Haven"), then a few sentences or "- " bullets under it; never use "#" or "##", and never a bold line as a heading; **bold** only key numbers. Decisions: one "- " bullet per decision actually made. ' +
      'Actions: one item per follow-up mentioned. Owner: ONLY a full name copied exactly from the team list given, and only when the notes clearly give the task to that person (first names and initials such as "GB" may be matched to the team member they clearly refer to). ' +
      'Anyone else named in the notes (founders, partners, outside contacts) is never an owner: mention them in the action text instead, and set owner to null. Due date only if stated (YYYY-MM-DD). Summary: two or three sentences.',
    user: 'Meeting: ' + input.title + '\nType: ' + (MEETING_KINDS[input.kind] ?? input.kind) + (input.entity ? '\nCompany: ' + input.entity : '') + '\nDate: ' + input.held_at.slice(0, 10) +
      '\nAttendees: ' + (input.attendees.join(', ') || 'not listed') + '\nTeam (the only people who can own an action): ' + (input.team.join(', ') || 'none') + (input.guests ? '\nGuests: ' + input.guests : '') + (input.agenda ? '\n\nAgenda:\n' + input.agenda.slice(0, 6000) : '') + '\n\nRough notes:\n' + input.notes.slice(0, 30000),
    toolName: 'write_minutes', toolDescription: 'Return the meeting minutes.',
    jsonSchema: { type: 'object', required: ['summary', 'minutes', 'decisions', 'actions'], properties: { summary: { type: 'string' }, minutes: { type: 'string', description: 'Markdown minutes by topic.' }, decisions: { type: 'string', description: 'Markdown bullets, or empty if none.' },
      actions: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, owner: { type: ['string', 'null'] }, due: { type: ['string', 'null'] } } } } } },
    schema: z.object({ summary: z.string().max(4000), minutes: z.string().max(60000), decisions: z.string().max(20000), actions: z.array(z.object({ text: z.string().max(500), owner: z.string().max(200).nullable().optional().transform((v) => v ?? null), due: z.string().max(20).nullable().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)) })).max(40) }), maxTokens: 3500 })
  return output
}

// Who sees which minutes: people limited to some companies (Team → companies) see the minutes of those companies, plus
// any meeting they attended or wrote; group-wide minutes (no company) and other companies' minutes stay hidden.
// Everyone else sees all. Returns a SQL condition on alias m, with its parameters numbered from n.
export function meetingScope(event: import('h3').H3Event, userId: string, n: number): { sql: string; params: unknown[] } {
  const scope = String(event.context.entityScope ?? '').split(',').filter(Boolean)
  if (!scope.length) return { sql: 'true', params: [] }
  return { sql: '(m.entity_id = ANY($' + n + '::uuid[]) OR m.created_by = $' + (n + 1) + '::uuid OR $' + (n + 1) + '::uuid = ANY(m.attendees))', params: [scope, userId] }
}
export function scopeOf(event: import('h3').H3Event): string[] { return String(event.context.entityScope ?? '').split(',').filter(Boolean) }
// People in this workspace who can attend (for the attendee picker and action owners).
export async function orgPeople(): Promise<{ id: string; name: string; email: string }[]> {
  return (await db().query<{ id: string; name: string; email: string }>("SELECT u.id, coalesce(p.full_name, u.email) AS name, u.email FROM core.memberships m JOIN core.users u ON u.id = m.user_id LEFT JOIN core.people p ON p.id = u.person_id WHERE m.organization_id = core.current_org() AND m.status = 'active' ORDER BY 2")).rows
}
