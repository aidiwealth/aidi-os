-- 065_expenses_credit_cfg.sql — payments & expenses with vouchers and book entries; Formal exit post (draft).
BEGIN;
CREATE TABLE IF NOT EXISTS finance.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  number text, paid_on date NOT NULL, entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL, payee text NOT NULL CHECK (length(payee) BETWEEN 1 AND 200),
  category text NOT NULL, description text, amount numeric(16,2) NOT NULL CHECK (amount > 0), currency text NOT NULL DEFAULT 'USD', method text, bank_account_id uuid REFERENCES banking.accounts(id) ON DELETE SET NULL,
  reference text, voucher_id uuid REFERENCES core.documents(id) ON DELETE SET NULL, attachment_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS expenses_date ON finance.expenses (paid_on DESC);
ALTER TABLE finance.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON finance.expenses;
CREATE POLICY tenant_isolation ON finance.expenses USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON finance.expenses TO aidi_os_app;
DROP POLICY IF EXISTS entity_scope ON finance.expenses;
CREATE POLICY entity_scope ON finance.expenses AS RESTRICTIVE USING (core.is_bypass() OR core.entity_ok(entity_id)) WITH CHECK (core.is_bypass() OR core.entity_ok(entity_id));
ALTER TABLE finance.journal ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES finance.expenses(id) ON DELETE CASCADE;
UPDATE core.plans SET modules = array_append(modules, 'expenses') WHERE code = 'internal' AND NOT ('expenses' = ANY(modules));
INSERT INTO content.posts (organization_id, slug, title, description, tag, body, author_name, status, seo_title, seo_description)
SELECT o.id, 'formal-our-first-ai-exit', 'Formal: our first AI exit, at 13x', 'Aidi Ventures has sold its position in Formal to Andreessen Horowitz, returning 13x. Why we invested, and what comes next for Aidi Ventures.', 'Portfolio',
  $blog$At Aidi Ventures we write small, early cheques into technical founders who are building the infrastructure the next decade will run on. Today we are sharing a milestone for the firm: our first exit from an AI company. We have sold our position in **Formal** to **Andreessen Horowitz (a16z)**, returning **13x** on our investment.

It is a proud moment for us, and above all a credit to the Formal team.

## What Formal does

Every company is now wiring AI agents, internal tools and automated services into its most sensitive systems: production databases, data warehouses, customer records. The old approach to access, where a handful of engineers hold standing credentials and logs are reviewed after the fact, does not hold up when software is acting on its own at machine speed.

Formal sits in that path. It gives security and engineering teams one place to decide who and what can reach sensitive data, to apply those rules at the moment of access, and to see a clear record of every request, whether it comes from a person, a service or an AI agent.

## Why we invested

We backed Formal for three reasons.

**1. A problem that grows with AI, not one that AI replaces.** Our thesis is simple: as more work is done by models and agents, the value of controlling what those systems can touch goes up, not down. Data access sits underneath every AI deployment in the enterprise. Formal was building for that world before most buyers had a name for it.

**2. Founders who had lived the problem.** The team came from building and securing data infrastructure at scale. They understood the pain from the inside, which showed in how quickly they shipped and how precisely they described the buyer.

**3. The quality of the room.** We invested alongside **Thrive Capital, Y Combinator, Abstract Ventures and Definition Capital**, together with founders from **Datadog, ClickHouse, Front and Alan**, and executives from **Rippling, Plaid, Vanta and Checkout.com**. When the people who built the modern data, infrastructure, security and payments stacks put their own money into a company, it tells you the problem is real and the team is credible. We were proud to stand with them.

## What the exit means for us

A 13x return on a single early position is meaningful for a firm of our size. More importantly, it validates the way we invest:

- **Write in early, with conviction**, when the problem is clear and the team is exceptional, even before the category is obvious.
- **Back technical founders building infrastructure**, the layer every AI application depends on.
- **Invest alongside the best**, and be useful in our own lane: access to markets, operators and customers across Africa and the diaspora.

We also want to thank the Formal founders for letting us be part of the journey, and our co-investors for being generous partners along the way.

## What comes next for Aidi Ventures

Formal is our first AI exit. We intend for it not to be our last.

**We will keep backing exceptional African and diaspora technical founders** building AI, infrastructure and financial services for the world, from pre-seed to Series A. We are open to founders of every background, and a partner reads every pitch.

**We are going deeper on AI infrastructure.** The pattern behind Formal, critical infrastructure that becomes more valuable as AI adoption grows, is where we will keep looking: security and access, data, developer tooling, voice and communications, and the financial rails that let AI products reach real customers.

**We are building a more institutional platform.** Through the Aidi Angel Fund we have backed twenty companies alongside a close community of angels. We are now building out the next chapter of Aidi Ventures, with the processes, tools and team to support founders at greater scale, and we will share more in the months ahead.

**We are widening how we support founders.** Alongside equity, we are developing venture debt for growing companies that need working capital without giving up more of their company, assessed with the same care we bring to every investment.

If you are building in AI, infrastructure or financial services, we would love to hear from you. Send us your pitch at [aidiventures.com/pitch](https://aidiventures.com/pitch).

*Past performance is not indicative of future results. This post is for information only and is not an offer to sell, or a solicitation of an offer to buy, any security or interest in any fund.*
$blog$, 'Emmanuel Gbolade', 'draft', 'Formal: Aidi Ventures'' first AI exit, at 13x', 'Aidi Ventures sold its stake in Formal to a16z at 13x. Why we backed Formal alongside Thrive Capital and Y Combinator, and where Aidi Ventures goes next.'
  FROM core.organizations o WHERE o.plan_code = 'internal' AND NOT EXISTS (SELECT 1 FROM content.posts p WHERE p.organization_id = o.id AND p.slug = 'formal-our-first-ai-exit') ORDER BY o.created_at LIMIT 1;
COMMIT;
