// The AI analyst chat (Aidi OS and Finvry). Short history, read-only tools, small model.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (user.roles.length && user.roles.every((r) => r === 'wealth_client')) throw apiError('forbidden', 'Not available.', 403)
  rateLimit('analyst', user.userId, 60, 60 * 60 * 1000)
  const b = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).min(1).max(30), path: z.string().max(200).default('/') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  return analystReply(event, b.data.messages, b.data.path)
})
