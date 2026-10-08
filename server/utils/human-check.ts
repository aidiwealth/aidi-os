// Sign-in and sign-up bot check: enforced only when both the Turnstile secret and the public site key are set.
export async function verifyHuman(token: string | undefined, ip: string): Promise<void> {
  const c = useRuntimeConfig() as unknown as { turnstileSecret: string; public: { turnstileSiteKey: string } }
  if (!c.turnstileSecret || !c.public.turnstileSiteKey) return
  await verifyTurnstile(token, ip)
}
