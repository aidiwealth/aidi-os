// A scheduled job (the /api/public/cron/* endpoints called by GitHub Actions) that fails is sent to Slack's Critical
// channel, so nobody has to watch the Actions log. A bad cron secret is not a failure of the job.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('error', (error, ctx) => {
    const path = ctx.event?.path ?? ''
    if (!path.startsWith('/api/public/cron/')) return
    const code = (error as { statusCode?: number }).statusCode ?? 500
    if (code < 500) return
    slack('critical.cron', 'Scheduled job failed: ' + path.replace('/api/public/cron/', '').replace(/\?.*$/, ''), [['Error', String((error as Error).message ?? error).slice(0, 200)]])
  })
})
