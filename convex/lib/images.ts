// convex/lib/images.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Helpers partagés pour la manipulation d'URLs d'images côté Convex.
//
// Pourquoi un module dédié ?
//   - Plusieurs modules Convex envoient des URLs d'images à des services tiers :
//     * convex/emails.ts → Resend (rendering inline dans <img src="">)
//     * convex/social.ts → Zernio (Facebook/Instagram fetch les médias par URL)
//   - Tous ces tiers exigent que les URLs soient HTTPS publiques et alignées sur
//     le domaine d'envoi (warning Gmail "Host images on the sending domain",
//     contrainte Zernio "URLs must be publicly accessible over HTTPS").
//   - On factorise donc ici la logique de proxification, plutôt que de la copier
//     dans chaque fichier.
//
// Mécanisme :
//   - Les images Unsplash et Convex storage sont réécrites vers /img/unsplash/...
//     et /img/convex/... — des routes définies dans vercel.json qui font un proxy
//     vers les origines réelles. Pour le destinataire / le crawler, les images
//     "viennent" donc bien de osy-immo.com.
//
// Voir convex/emails.ts pour le contexte historique (warning Resend qui a motivé
// la mise en place de ce proxy).
// -------------------------------------------------------------------------------------------------

// URL publique du frontend (utilisée pour préfixer les routes proxy /img/...).
// Lu depuis les env vars Convex — différent côté dev (localhost) et prod (osy-immo.com).
const APP_URL =
  process.env.APP_URL ?? process.env.SITE_URL ?? "http://localhost:3000";

/**
 * Proxifie une URL d'image externe via osy-immo.com.
 *
 * Exemples :
 *   - "https://images.unsplash.com/photo-XXX?auto=format"
 *     → "https://osy-immo.com/img/unsplash/photo-XXX?auto=format"
 *   - "https://moonlit-chipmunk-526.convex.cloud/api/storage/abc"
 *     → "https://osy-immo.com/img/convex/abc"
 *   - URL externe inconnue (autre CDN) → renvoyée telle quelle ; le consommateur
 *     décide d'inclure ou de filtrer.
 *
 * @param url URL source (peut être `undefined`, dans quel cas on renvoie `undefined`)
 * @returns URL proxifiée ou inchangée selon le cas
 */
export function proxifyImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  // Unsplash : on garde le path complet + les query params (?auto=format&w=...)
  if (url.startsWith("https://images.unsplash.com/")) {
    return url.replace(
      "https://images.unsplash.com/",
      `${APP_URL}/img/unsplash/`
    );
  }
  // Convex storage : URL signée du type https://<deploy>.convex.cloud/api/storage/<id>?token=...
  // La regex capture l'<id> + tout ce qui suit (query string éventuelle incluse).
  const convexMatch = url.match(
    /^https:\/\/[^/]+\.convex\.cloud\/api\/storage\/(.+)$/
  );
  if (convexMatch) {
    return `${APP_URL}/img/convex/${convexMatch[1]}`;
  }
  // URL externe inconnue (og:default.jpg local, autre CDN, etc.) : on n'y touche pas.
  return url;
}
