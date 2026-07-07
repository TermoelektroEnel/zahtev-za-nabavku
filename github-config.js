/**
 * GITHUB KONFIGURACIJA
 * --------------------
 * 1. Napravi NOVI, poseban repozitorijum SAMO za podatke, npr:
 *    "zahtevi-data" (može biti privatan ili javan, svejedno je za ovu
 *    svrhu — token je ionako ograničen samo na njega).
 *    https://github.com/new
 *
 * 2. Napravi Personal Access Token (fine-grained):
 *    https://github.com/settings/personal-access-tokens/new
 *    - "Repository access" -> Only select repositories -> odaberi "zahtevi-data"
 *    - "Permissions" -> "Contents" -> "Read and write" (SVE OSTALO ostavi na "No access")
 *    - Postavi rok trajanja (npr. 1 godina) i zapamti da ga obnoviš na vreme
 *    - Klikni "Generate token" i ODMAH ga kopiraj (kasnije se ne može videti ponovo)
 *
 * 3. Nalepi podatke ispod.
 */

const GITHUB_CONFIG = {
  owner: "TermoelektroEnel",     // npr. "pera123"
  repo: "zahtevi-data",              // ime repo-a iz koraka 1
  path: "data.json",                 // ne menjaj, osim ako želiš drugo ime fajla
  branch: "main",                    // proveri da li ti je podrazumevana grana "main" ili "master"
  token: "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"
};
