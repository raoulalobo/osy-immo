// src/lib/referrer.ts
// -------------------------------------------------------------------------------------------------
// Rôle : classifier `document.referrer` en bucket sémantique pour les stats
//        d'origine de trafic d'une annonce.
//
// Utilisé par `useTrackPageView` (cf. src/routes/properties.$id.tsx) qui le
// passe à `events.record({referrerSource})`. Le bucket résultant alimente
// la colonne "Sources" du dashboard (`dashboard.index.tsx`), à condition que
// l'URL d'arrivée ne porte PAS de `?utm_source=...` (qui prend priorité car
// taggé explicitement par le ShareButton).
//
// Buckets de sortie :
//   - "direct"     : pas de Referer (URL tapée, bookmark, lien collé direct)
//   - "internal"   : Referer = même hostname que la page courante
//   - "google" / "bing" / "duckduckgo" / "qwant" / "yahoo" / "ecosia" / "brave"
//                  : moteurs de recherche connus
//   - "external"   : autre site externe non reconnu
//
// On classifie CÔTÉ CLIENT car Convex n'a pas accès au `window.location.origin`
// (pour détecter "internal") et que la liste de moteurs reste maintenable ici.
// -------------------------------------------------------------------------------------------------

// Patterns des moteurs de recherche grand public — testés contre `hostname`.
// L'ordre n'importe pas (premier match l'emporte mais pas de chevauchement).
const SEARCH_ENGINES: Array<{ pattern: RegExp; bucket: string }> = [
  // google.com, google.fr, www.google.cm, etc. — variantes country-code TLD
  { pattern: /(?:^|\.)google\./i, bucket: "google" },
  { pattern: /(?:^|\.)bing\./i, bucket: "bing" },
  { pattern: /(?:^|\.)duckduckgo\.com$/i, bucket: "duckduckgo" },
  { pattern: /(?:^|\.)qwant\.com$/i, bucket: "qwant" },
  // Yahoo search a une URL spécifique (search.yahoo.com), pas le portail
  { pattern: /(?:^|\.)search\.yahoo\./i, bucket: "yahoo" },
  { pattern: /(?:^|\.)ecosia\.org$/i, bucket: "ecosia" },
  { pattern: /(?:^|\.)search\.brave\.com$/i, bucket: "brave" },
];

/**
 * Classifie un Referer en bucket sémantique.
 *
 * @param referrer       Valeur brute de `document.referrer` (string vide si aucun)
 * @param currentOrigin  `window.location.origin` de la page courante
 *                       — utilisé pour détecter le bucket "internal"
 * @returns Un identifiant de bucket parmi ceux listés en tête de fichier.
 */
export function classifyReferrer(
  referrer: string,
  currentOrigin: string
): string {
  // Cas 1 : aucun Referer fourni par le navigateur.
  // Sources : URL tapée à la main, bookmark, lien collé manuellement après copie,
  // certaines apps de messagerie qui strip le Referer pour des raisons de privacy.
  if (!referrer) return "direct";

  // Parse le Referer en URL. Une chaîne invalide → traitée comme "direct"
  // (mieux vaut sous-classifier que crasher la mutation).
  let referrerUrl: URL;
  try {
    referrerUrl = new URL(referrer);
  } catch {
    return "direct";
  }

  // Cas 2 : navigation interne. On compare les hostnames en normalisant le `www.`
  // pour traiter "osy-immo.com" et "www.osy-immo.com" comme la même origine.
  try {
    const current = new URL(currentOrigin);
    const stripWww = (h: string) => h.replace(/^www\./i, "");
    if (stripWww(referrerUrl.hostname) === stripWww(current.hostname)) {
      return "internal";
    }
  } catch {
    // currentOrigin invalide (très improbable côté navigateur) — on continue
    // avec les autres règles plutôt que de retourner "direct" à tort.
  }

  // Cas 3 : moteur de recherche connu (premier match l'emporte).
  for (const { pattern, bucket } of SEARCH_ENGINES) {
    if (pattern.test(referrerUrl.hostname)) return bucket;
  }

  // Cas 4 : autre site externe non reconnu (LinkedIn, Twitter, un blog, etc.).
  // On garde un seul bucket "external" pour rester actionnable côté UI ; si
  // plus tard on veut détailler par domaine, on stockera aussi le hostname brut.
  return "external";
}
