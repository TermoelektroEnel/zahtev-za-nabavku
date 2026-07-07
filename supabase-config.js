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
  url: "https://qxwrfrsjkhhrtepyliru.supabase.co",
  anonKey: "sb_publishable_4JjbYj2zb8BEt5Z8YJGz9A_4BkF093v",
  emailDomain: "zahtev.local"
};
