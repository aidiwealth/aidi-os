// Send a test message to one Slack channel, to check its webhook.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = z.object({ channel: z.enum(['aidi', 'finvry', 'critical']) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a channel.')
  const url = (await slackSettings(true))[b.data.channel]
  if (!url) throw apiError('not_set', 'Add the webhook for this channel first.')
  const ok = await postSlack(url, '*Test alert* from the Finvry console, sent by ' + staff.email + '. Alerts for this channel will arrive here.').catch(() => false)
  if (!ok) throw apiError('slack', 'Slack did not accept the message. Check the webhook link, or create a new one in Slack.', 502)
  return { ok: true }
})
