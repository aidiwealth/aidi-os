// Meeting minutes: who met, about which company, what was decided and who does what next. AI turns rough notes into
// clean minutes (summary, minutes, decisions and action items) using only what was written.
export const MEETING_KINDS: Record<string, string> = { team: 'Team meeting', board: 'Board meeting', investor: 'Investor meeting', client: 'Client meeting', partner: 'Partner meeting', one_on_one: 'One-to-one', other: 'Other' }
export interface MeetingAction { text: string; owner_id?: string | null; owner?: string | null; due?: string | null; done?: boolean }

export async function draftMinutes(input: { title: string; kind: string; entity: string | null; held_at: string; attendees: string[]; guests: string; agenda: string; notes: string; ref: string }): Promise<{ summary: string; minutes: string; decisions: string; actions: { text: string; owner: string | null; due: string | null }[] }> {
  const { z } = await import('zod')
  const { output } = await runAiTool({ task: 'meeting_minutes', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'minutes-v1', inputRef: input.ref,
    system: 'You write clear, professional meeting minutes for an investment and family-office team. Use only what is in the notes and agenda: never invent facts, figures, names, decisions or deadlines. Plain English, past tense, third person. ' +
      'Minutes: short "## " sections by topic, each with a few sentences or "- " bullets; **bold** key numbers. Decisions: one "- " bullet per decision actually made. Actions: one item per follow-up mentioned, with the owner only if named (match to an attendee name when possible) and the due date only if stated (YYYY-MM-DD). Summary: two or three sentences.',
    user: 'Meeting: ' + input.title + '\nType: ' + (MEETING_KINDS[input.kind] ?? input.kind) + (input.entity ? '\nCompany: ' + input.entity : '') + '\nDate: ' + input.held_at.slice(0, 10) +
      '\nAttendees: ' + (input.attendees.join(', ') || 'not listed') + (input.guests ? '\nGuests: ' + input.guests : '') + (input.agenda ? '\n\nAgenda:\n' + input.agenda.slice(0, 6000) : '') + '\n\nRough notes:\n' + input.notes.slice(0, 30000),
    toolName: 'write_minutes', toolDescription: 'Return the meeting minutes.',
    jsonSchema: { type: 'object', required: ['summary', 'minutes', 'decisions', 'actions'], properties: { summary: { type: 'string' }, minutes: { type: 'string', description: 'Markdown minutes by topic.' }, decisions: { type: 'string', description: 'Markdown bullets, or empty if none.' },
      actions: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, owner: { type: ['string', 'null'] }, due: { type: ['string', 'null'] } } } } } },
    schema: z.object({ summary: z.string().max(4000), minutes: z.string().max(60000), decisions: z.string().max(20000), actions: z.array(z.object({ text: z.string().max(500), owner: z.string().max(200).nullable().optional().transform((v) => v ?? null), due: z.string().max(20).nullable().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)) })).max(40) }), maxTokens: 3500 })
  return output
}

// People in this workspace who can attend (for the attendee picker and action owners).
export async function orgPeople(): Promise<{ id: string; name: string; email: string }[]> {
  return (await db().query<{ id: string; name: string; email: string }>("SELECT u.id, coalesce(p.full_name, u.email) AS name, u.email FROM core.memberships m JOIN core.users u ON u.id = m.user_id LEFT JOIN core.people p ON p.id = u.person_id WHERE m.organization_id = core.current_org() AND m.status = 'active' ORDER BY 2")).rows
}
