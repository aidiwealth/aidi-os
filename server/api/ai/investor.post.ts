// AI help adding an investor: from whatever you paste or type (a name, a firm, an email signature, a LinkedIn
// summary, a note) it fills the investor's name, firm, role, email (only when written in the text), typical cheque,
// stage and sector focus, location, and a short profile. Nothing is saved; the form shows it for you to check.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  await rateLimit('ai_investor', user.userId, 60, 60 * 60 * 1000)
  const b = z.object({ text: z.string().trim().min(2).max(6000), context: z.string().trim().max(300).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Type or paste something about the investor.')
  const s = z.object({ name: z.string().max(200), firm: z.string().max(200), role: z.string().max(120), email: z.string().max(254), ticket_min_usd: z.number().nullable(), ticket_max_usd: z.number().nullable(),
    stages: z.array(z.string().max(40)).max(6), sectors: z.array(z.string().max(40)).max(8), location: z.string().max(120), profile: z.string().max(800), known: z.boolean() })
  try {
    const { output } = await runAiTool({ task: 'investor_assist', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'investor-assist-v1', inputRef: 'investor:' + user.userId,
      system: 'You help a fundraising team add an investor to a pipeline. Read what they typed or pasted and fill the fields. Rules: take names, emails and numbers from the text; never make up an email address (leave it empty unless it appears in the text). '
        + 'For a well-known fund or angel you may add widely published facts (typical cheque size, stages, sectors, location) and set known=true; if you are not sure who this is, leave those empty and set known=false. Money in US dollars. Keep the profile to two or three plain sentences a founder can use: who they are, what they invest in, anything from the text worth remembering.',
      user: (b.data.context ? 'This is for: ' + b.data.context + '\n\n' : '') + 'About the investor:\n' + b.data.text,
      toolName: 'fill_investor', toolDescription: 'Fill the investor fields.', jsonSchema: { type: 'object', additionalProperties: false, required: ['name', 'firm', 'role', 'email', 'ticket_min_usd', 'ticket_max_usd', 'stages', 'sectors', 'location', 'profile', 'known'], properties: {
        name: { type: 'string', description: 'Person, or the fund name if no person is given.' }, firm: { type: 'string' }, role: { type: 'string', description: 'e.g. Partner, Angel' }, email: { type: 'string', description: 'Only if written in the text, else empty.' },
        ticket_min_usd: { type: ['number', 'null'] }, ticket_max_usd: { type: ['number', 'null'] }, stages: { type: 'array', items: { type: 'string' } }, sectors: { type: 'array', items: { type: 'string' } },
        location: { type: 'string' }, profile: { type: 'string' }, known: { type: 'boolean', description: 'True only if this is a well-known investor you recognise.' } } },
      schema: s, maxTokens: 700 })
    const o = output
    const email = o.email && b.data.text.toLowerCase().includes(o.email.toLowerCase()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email) ? o.email.toLowerCase() : ''
    return { ...o, email }
  } catch (err) { if ((err as { statusCode?: number }).statusCode) throw err; console.error('[ai] investor', (err as Error).message); throw apiError('ai_failed', 'Could not read that just now. Fill the fields by hand.', 502) }
})
