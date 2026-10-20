// Save Slack alerts: a webhook per channel (blank keeps it, "-" removes it) and the events switched off. Owner only.
import { z } from 'zod'
import { SLACK_EVENTS } from '~/shared/slack-events'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  if (staff.staffRole !== 'owner') throw apiError('forbidden', 'Only the platform owner can change Slack alerts.', 403)
  const url = z.string().trim().max(300).optional()
  const b = z.object({ aidi: url, finvry: url, critical: url, off: z.array(z.string().max(60)).max(100).default([]) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the webhook links.')
  const cur = await slackSettings(true)
  const next = { ...cur, off: b.data.off.filter((k) => SLACK_EVENTS.some((e) => e.key === k)) }
  for (const k of ['aidi', 'finvry', 'critical'] as const) {
    const v = b.data[k]
    if (v === undefined || v === '') continue
    if (v === '-') { next[k] = ''; continue }
    if (!slackUrlOk(v)) throw apiError('invalid', 'Paste a Slack incoming webhook link (https://hooks.slack.com/services/…).')
    next[k] = v
  }
  await asPlatform(() => db().query("INSERT INTO platform.settings (key, value, updated_by, updated_at) VALUES ('slack', $1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()", [JSON.stringify(next), staff.userId]))
  await slackSettings(true)
  await platformAudit(event, staff.userId, 'slack_settings', null, { channels: (['aidi', 'finvry', 'critical'] as const).filter((k) => !!next[k]), off: next.off })
  return { ok: true }
})
