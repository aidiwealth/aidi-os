// The AI analyst chat (Aidi OS and Finvry). Short history, read-only tools, small model. Each conversation is saved for
// the person who had it, so they can start a new one and come back to this one later.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (user.roles.length && user.roles.every((r) => r === 'wealth_client')) throw apiError('forbidden', 'Not available.', 403)
  rateLimit('analyst', user.userId, 60, 60 * 60 * 1000)
  const Act = z.object({ type: z.string().max(20), path: z.string().max(200), label: z.string().max(60) })
  const b = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000), actions: z.array(Act).max(6).optional() })).min(1).max(60), path: z.string().max(200).default('/'), chat_id: z.string().uuid().nullable().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const r = await analystReply(event, b.data.messages.map((m) => ({ role: m.role, content: m.content })), b.data.path)
  const all = [...b.data.messages, { role: 'assistant' as const, content: r.text, actions: r.actions as z.infer<typeof Act>[] }].slice(-60)
  let chatId = b.data.chat_id ?? null
  if (chatId && !(await db().query('UPDATE core.ai_chats SET messages = $3, updated_at = now() WHERE id = $1 AND user_id = $2', [chatId, user.userId, JSON.stringify(all)])).rowCount) chatId = null
  if (!chatId) {
    const first = b.data.messages.find((m) => m.role === 'user')?.content ?? 'Conversation'
    chatId = (await one<{ id: string }>('INSERT INTO core.ai_chats (user_id, title, messages) VALUES ($1,$2,$3) RETURNING id', [user.userId, first.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Conversation', JSON.stringify(all)])).id
  }
  return { ...r, chat_id: chatId }
})
