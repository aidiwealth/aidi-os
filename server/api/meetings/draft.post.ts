// AI: turn rough notes into clean minutes — summary, minutes by topic, decisions and action items.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family', 'admin')
  rateLimit('minutes_ai', user.userId, 30, 60 * 60 * 1000)
  const b = z.object({ title: z.string().max(200).default('Meeting'), kind: z.string().max(20).default('team'), entity_id: z.string().uuid().nullable().optional(), held_at: z.string().max(40).default(''), attendees: z.array(z.string().uuid()).max(100).default([]), guests: z.string().max(1000).default(''), agenda: z.string().max(20000).default(''), notes: z.string().max(60000) }).safeParse(await readBody(event))
  if (!b.success || b.data.notes.replace(/\s/g, '').length < 20) throw apiError('invalid', 'Write or paste your rough notes first (a few lines is enough).')
  const d = b.data
  const people = await orgPeople(), names = d.attendees.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean) as string[]
  const entity = d.entity_id ? (await db().query<{ name: string }>('SELECT name FROM core.entities WHERE id = $1', [d.entity_id])).rows[0]?.name ?? null : null
  try {
    const out = await draftMinutes({ title: d.title, kind: d.kind, entity, held_at: d.held_at || new Date().toISOString(), attendees: names, guests: d.guests, agenda: d.agenda, notes: d.notes, ref: 'minutes:' + user.userId })
    // Match named owners to attendees so action items can be assigned.
    const actions = out.actions.map((a) => { const p = a.owner ? people.find((x) => x.name.toLowerCase() === a.owner!.toLowerCase() || x.name.split(' ')[0]!.toLowerCase() === a.owner!.toLowerCase().split(' ')[0]) : undefined; return { text: a.text, owner_id: p?.id ?? null, owner: p ? null : a.owner, due: a.due, done: false } })
    return { ...out, actions }
  } catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[minutes] AI failed', err); throw apiError('ai_failed', 'Could not write the minutes just now. Try again in a moment.', 502) }
})
