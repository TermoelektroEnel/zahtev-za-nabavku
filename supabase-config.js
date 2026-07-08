/**
 * SUPABASE KONFIGURACIJA
 * ----------------------
 * Ove vrednosti su JAVNE i bezbedne za browser:
 *  - URL projekta
 *  - "publishable"/anon ključ (zaštita dolazi od RLS pravila u bazi,
 *    a ne od tajnosti ovog ključa)
 *
 * NE stavljaj ovde "service_role" ključ — on zaobilazi RLS i mora
 * ostati tajan (samo na serveru / u Supabase Dashboard-u).
 *
 * EMAIL_DOMAIN: korisnici se prijavljuju korisničkim imenom, koje se
 * interno mapira u email "<username>@<EMAIL_DOMAIN>".
 */
const SUPABASE_CONFIG = {
  url: "https://yalsccrxelnswxdekzsf.supabase.co",
  anonKey: "sb_publishable_PiwJNk84lByWzFnK2VE67A_05B8JKE-",
  emailDomain: "zahtev.local"
};
