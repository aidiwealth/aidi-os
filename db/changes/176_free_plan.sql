-- 176_free_plan.sql — Finvry's Free plan: the investor page, investor updates and contacts, Banking (live bank feed,
-- spend tracking, transaction analysis and perks) and the compliance calendar. Ordering Aidi's services, messages
-- and the wallet stay open on every plan. Financials, boards, decks, documents and the rest come with Startup and up
-- (Startup includes everything in Free).
BEGIN;
UPDATE core.plans SET modules = '{investor_page,updates,contacts,banking_treasury,compliance,company_services,client_inbox,wallet,client_raise}',
  description = 'Your investor page, investor updates and a live bank feed, with spend tracking and the compliance calendar.' WHERE code = 'company_free';
UPDATE core.plans SET modules = (SELECT array_agg(DISTINCT m) FROM unnest(modules || '{investor_page,updates,contacts,banking_treasury,compliance}'::text[]) m) WHERE code IN ('company_startup', 'company_medium', 'company_scale');
COMMIT;
