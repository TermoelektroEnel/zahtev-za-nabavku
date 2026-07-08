/**
 * EDGE FUNCTION: manage-users
 * ---------------------------
 * Server-side upravljanje korisnicima za admin.html.
 *
 * ZAŠTO EDGE FUNKCIJA?
 *  - Kreiranje/brisanje/reset lozinke zahteva Supabase Admin Auth API,
 *    koji radi ISKLJUČIVO sa `service_role` ključem.
 *  - `service_role` ključ zaobilazi RLS i NIKAD ne sme u browser.
 *  - Zato ta operacija živi ovde (na serveru), a browser je samo poziva.
 *
 * BEZBEDNOST:
 *  1. `verify_jwt` (podrazumevano uključeno) — Supabase gateway odbacuje
 *     zahteve bez validnog JWT-a pre nego što funkcija uopšte krene.
 *  2. Funkcija dodatno proverava da je POZIVALAC administrator (is_admin()
 *     RPC sa njegovim tokenom) pre bilo kakve privilegovane radnje.
 *  3. Kreira SAMO obične korisnike — nema nijedne putanje koja postavlja
 *     role = 'admin'. Administrator se dodeljuje isključivo ručno u bazi.
 *  4. Odbija brisanje / promenu lozinke administratorskog naloga.
 *
 * DEPLOY:
 *   supabase functions deploy manage-users
 * (SUPABASE_URL, SUPABASE_ANON_KEY i SUPABASE_SERVICE_ROLE_KEY su
 *  automatski dostupni kao okружenje u Edge runtime-u.)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mora se poklapati sa emailDomain iz supabase-config.js
const EMAIL_DOMAIN = "zahtev.local";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ---- gradiliste <-> gradilista_raw (ista semantika kao supabase-backend.js) ----
 *   null / 'SVA' -> 'SVA'  (sva gradilišta)
 *   []           -> ''     (nijedno)
 *   ['901','902']-> '901,902'
 */
function serializeGradiliste(g: unknown): string {
  if (g === null || g === undefined || g === "SVA") return "SVA";
  if (!Array.isArray(g) || g.length === 0) return "";
  return g.map((s) => String(s).trim()).filter(Boolean).join(",");
}
function parseGradiliste(raw: unknown): null | string[] {
  const v = String(raw ?? "").trim();
  if (v === "SVA") return null;
  if (v === "") return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- 1) Proveri da je pozivalac prijavljen i da je ADMIN ---
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Niste prijavljeni." });
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin, error: adminErr } = await callerClient.rpc(
      "is_admin",
    );
    if (adminErr || !isAdmin) {
      return json({ error: "Nemate administratorska prava." });
    }

    // --- 2) Privilegovani klijent (service_role) ---
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    /* ---- LISTA KORISNIKA ---- */
    if (action === "listUsers") {
      const { data, error } = await admin
        .from("profiles")
        .select("id, username, role, created_at, gradilista_raw")
        .order("username");
      if (error) return json({ error: error.message });
      const users = (data || []).map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        created_at: u.created_at,
        gradilista: parseGradiliste(u.gradilista_raw),
      }));
      return json({ users });
    }

    /* ---- KREIRANJE OBIČNOG KORISNIKA ---- */
    if (action === "createUser") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!/^[a-z0-9._-]{3,}$/.test(username)) {
        return json({
          error:
            "Korisničko ime: najmanje 3 znaka (mala slova, brojevi, . _ -).",
        });
      }
      if (password.length < 8) {
        return json({ error: "Lozinka mora imati bar 8 znakova." });
      }
      const email = `${username}@${EMAIL_DOMAIN}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username },
      });
      if (error) {
        const msg = /already been registered|exists/i.test(error.message)
          ? "Korisnik sa tim imenom već postoji."
          : error.message;
        return json({ error: msg });
      }
      // role ostaje 'user' (postavlja ga trigger handle_new_user).
      // Ovde se NIKAD ne dodeljuje admin.
      // Dodeli gradilišta za koja korisnik sme da pravi zahtev.
      const newId = data.user?.id;
      if (newId) {
        const gradRaw = serializeGradiliste(body.gradiliste ?? null);
        const { error: gErr } = await admin
          .from("profiles")
          .update({ gradilista_raw: gradRaw })
          .eq("id", newId);
        if (gErr) return json({ error: gErr.message });
      }
      return json({ ok: true, user: { id: newId, username } });
    }

    /* ---- RESET LOZINKE ---- */
    if (action === "resetPassword") {
      const id = String(body.id || "");
      const password = String(body.password || "");
      if (!id) return json({ error: "Nedostaje ID korisnika." });
      if (password.length < 8) {
        return json({ error: "Lozinka mora imati bar 8 znakova." });
      }
      const { data: prof } = await admin
        .from("profiles")
        .select("role")
        .eq("id", id)
        .maybeSingle();
      if (prof?.role === "admin") {
        return json({
          error: "Lozinku administratora promeni u Supabase Dashboard-u.",
        });
      }
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message });
      return json({ ok: true });
    }

    /* ---- IZMENA DODELJENIH GRADILIŠTA ---- */
    if (action === "updateUserGradilista") {
      const id = String(body.id || "");
      if (!id) return json({ error: "Nedostaje ID korisnika." });
      const { data: prof } = await admin
        .from("profiles")
        .select("role")
        .eq("id", id)
        .maybeSingle();
      if (prof?.role === "admin") {
        return json({
          error: "Administrator već ima sva gradilišta — ne dodeljuju se ovde.",
        });
      }
      const gradRaw = serializeGradiliste(body.gradiliste ?? null);
      const { error } = await admin
        .from("profiles")
        .update({ gradilista_raw: gradRaw })
        .eq("id", id);
      if (error) return json({ error: error.message });
      return json({ ok: true });
    }

    /* ---- BRISANJE KORISNIKA ---- */
    if (action === "deleteUser") {
      const id = String(body.id || "");
      if (!id) return json({ error: "Nedostaje ID korisnika." });
      const { data: prof } = await admin
        .from("profiles")
        .select("role")
        .eq("id", id)
        .maybeSingle();
      if (prof?.role === "admin") {
        return json({
          error: "Administratorski nalog se ne može obrisati odavde.",
        });
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message });
      return json({ ok: true });
    }

    return json({ error: "Nepoznata akcija." });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
