// Render blocks (a single block in the editor, or the whole email preview "viewed as" a contact).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ blocks: z.array(z.any()).max(80), title: z.string().max(200).default(''), cover_id: z.string().uuid().nullable().optional(), from_name: z.string().max(120).default(''), full: z.boolean().default(false), as_name: z.string().max(200).default('') }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const base = brands().finvry.url, org = (await currentOrg())!
  if (!b.data.full) return { html: await renderBlocks(b.data.blocks as Block[], base) }
  return { html: await renderUpdateDoc({ title: b.data.title, blocks: b.data.blocks as Block[], cover_id: b.data.cover_id ?? null, from_name: b.data.from_name }, { company: org.name, base, email: true, greeting: b.data.as_name.split(' ')[0] || 'there', viewUrl: '#', unsubUrl: '#' }) }
})
