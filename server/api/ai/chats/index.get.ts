// This person's AI analyst conversations, latest first.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return (await db().query("SELECT id, title, jsonb_array_length(messages)::int AS messages, updated_at FROM core.ai_chats WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 40", [user.userId])).rows
})
