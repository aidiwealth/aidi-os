// Daily: charge due plans and services from the wallet, else the card on file; retry once after 3 days, then move the
// company to Free (plans) or pause the service (services). Emails a reminder 3 days before a charge the wallet can't cover.
import { timingSafeEqual } from 'node:crypto'
interface Sub { id: string; organization_id: string; kind: string; code: string; name: string; client_id: string | null; amount_minor: string; currency: string; interval: string; next_charge_at: string; failures: number; reminded_for: string | null }
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const out = { charged: 0, carded: 0, retry: 0, suspended: 0, reminded: 0 }
  const plans = await asPlatform(() => db().query<{ id: string }>("SELECT o.id FROM core.organizations o WHERE o.kind = 'company' AND o.plan_code <> 'company_free' AND o.status <> 'closed' AND NOT EXISTS (SELECT 1 FROM wallet.subscriptions s WHERE s.organization_id = o.id AND s.kind = 'plan' AND s.status <> 'cancelled')"))
  for (const p of plans.rows) await syncPlanSubscription(p.id)
  const url = brands().finvry.url
  const notify = async (orgId: string, subject: string, heading: string, body: string, cta: string, link: string) => { setOrgContext(orgId); for (const to of await orgNotifyEmails()) await sendWalletNotice(to, subject, heading, body, cta, link).catch((e) => console.error('[wallet cron] email failed', e)); setOrgContext(null) }
  const money = (minor: number, c: string) => (c === 'NGN' ? '₦' : '$') + (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })
  // reminders
  const soon = (await asPlatform(() => db().query<Sub>("SELECT id, organization_id, kind, code, name, client_id, amount_minor::text, currency, interval, to_char(next_charge_at, 'YYYY-MM-DD') AS next_charge_at, failures, to_char(reminded_for, 'YYYY-MM-DD') AS reminded_for FROM wallet.subscriptions WHERE status = 'active' AND next_charge_at BETWEEN current_date + 1 AND current_date + 3 AND (reminded_for IS NULL OR reminded_for <> next_charge_at)"))).rows
  for (const s of soon) {
    const w = await walletOf(s.organization_id), amt = Number(s.amount_minor)
    if (w.balance_minor < amt && !(await cardOnFile(s.organization_id, s.currency))) { await notify(s.organization_id, 'Top up before ' + s.next_charge_at, 'Your wallet needs ' + money(amt, s.currency), s.name + ' renews on ' + s.next_charge_at + ' for ' + money(amt, s.currency) + '. Your wallet has ' + money(w.balance_minor, w.currency) + ' and there is no card on file. Top up to keep it running.', 'Top up your wallet', url + '/wallet'); out.reminded++ }
    await asPlatform(() => db().query('UPDATE wallet.subscriptions SET reminded_for = next_charge_at WHERE id = $1', [s.id]))
  }
  // charges
  const due = (await asPlatform(() => db().query<Sub>("SELECT id, organization_id, kind, code, name, client_id, amount_minor::text, currency, interval, to_char(next_charge_at, 'YYYY-MM-DD') AS next_charge_at, failures, NULL AS reminded_for FROM wallet.subscriptions WHERE status = 'active' AND next_charge_at <= current_date ORDER BY next_charge_at LIMIT 500"))).rows
  for (const s of due) {
    const amt = Number(s.amount_minor), cat = s.kind === 'plan' ? 'subscription' : 'service'
    const reason = s.name + ' (' + (s.interval === 'month' ? 'monthly' : 'yearly') + ')'
    const ref = 'sub:' + s.id + ':' + s.next_charge_at
    let paid = false, why = ''
    const w = await walletOf(s.organization_id)
    if (w.currency !== s.currency) why = 'Wallet currency differs'
    else {
      if (w.balance_minor >= amt) { try { await postLedger(s.organization_id, 'debit', amt, cat, reason, { reference: ref }); paid = true; out.charged++ } catch (e) { why = (e as Error).message } }
      if (!paid) { const c = await chargeCardIntoWallet(s.organization_id, amt - (await walletOf(s.organization_id)).balance_minor > 0 ? amt - (await walletOf(s.organization_id)).balance_minor : amt, s.currency, reason)
        if (c.ok) { try { await postLedger(s.organization_id, 'debit', amt, cat, reason, { reference: ref }); paid = true; out.carded++ } catch (e) { why = (e as Error).message } } else why = c.reason ?? 'Card declined' }
    }
    if (paid) {
      await asPlatform(async () => {
        await db().query("UPDATE wallet.subscriptions SET next_charge_at = next_charge_at + CASE WHEN interval = 'month' THEN interval '1 month' ELSE interval '1 year' END, failures = 0, last_error = NULL, updated_at = now() WHERE id = $1", [s.id])
        if (s.kind === 'plan') await db().query("UPDATE core.organizations SET status = 'active', trial_ends_at = NULL WHERE id = $1 AND status IN ('trial','past_due')", [s.organization_id])
      })
      continue
    }
    if (s.failures < 1) {
      await asPlatform(() => db().query("UPDATE wallet.subscriptions SET failures = failures + 1, last_error = $2, next_charge_at = current_date + 3, updated_at = now() WHERE id = $1", [s.id, why.slice(0, 300)]))
      await notify(s.organization_id, 'We could not charge ' + s.name, 'Payment for ' + s.name + ' did not go through', 'We tried to collect ' + money(amt, s.currency) + ' from your wallet and card on file (' + why + '). We will try again in 3 days. Top up your wallet or update your card to avoid ' + (s.kind === 'plan' ? 'moving to the Free plan.' : 'the service being paused.'), 'Top up your wallet', url + '/wallet')
      out.retry++; continue
    }
    await asPlatform(async () => {
      await db().query("UPDATE wallet.subscriptions SET status = 'suspended', last_error = $2, updated_at = now() WHERE id = $1", [s.id, why.slice(0, 300)])
      if (s.kind === 'plan') await db().query("UPDATE core.organizations SET plan_code = 'company_free', status = 'active', trial_ends_at = NULL, settings = settings || '{\"trial_used\": \"true\"}'::jsonb WHERE id = $1", [s.organization_id])
      else if (s.client_id) await db().query("INSERT INTO services.jobs (organization_id, client_id, service, title, description, status, priority) SELECT organization_id, id, 'other', $2, $3, 'new', 'high' FROM services.clients WHERE id = $1", [s.client_id, ('Paused for non-payment: ' + s.name).slice(0, 200), 'Automatic renewal failed twice (' + why + '). The service is paused until the customer pays.'])
    })
    await notify(s.organization_id, s.kind === 'plan' ? 'Your plan moved to Free' : s.name + ' is paused', s.kind === 'plan' ? 'Your workspace is now on the Free plan' : s.name + ' has been paused',
      (s.kind === 'plan' ? 'We could not collect ' + money(amt, s.currency) + ' for your ' + s.name + ', so your workspace moved to the Free plan. Your data is safe. Top up and choose your plan again in Settings to restore everything.' : 'We could not collect ' + money(amt, s.currency) + ' for ' + s.name + ', so it is paused. Top up your wallet and reorder it under Services to restart it.'),
      s.kind === 'plan' ? 'Choose a plan' : 'Top up your wallet', url + (s.kind === 'plan' ? '/settings?s=plan' : '/wallet'))
    out.suspended++
  }
  return { ok: true, ...out }
})
