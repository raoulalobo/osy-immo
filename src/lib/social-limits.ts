// src/lib/social-limits.ts
// -------------------------------------------------------------------------------------------------
// Rôle : constantes partagées sur les limites de caractères imposées par les
//        publications réseaux sociaux (Facebook + Instagram + TikTok via Zernio).
//
// Pourquoi un fichier dédié :
//   - Évite la duplication de magic numbers entre le frontend (compteur visuel
//     dans PropertyForm) et le backend (troncature réelle dans convex/social.ts).
//   - Convex ne peut pas importer depuis src/, mais le frontend peut importer
//     d'ici. La cohérence est donc maintenue manuellement, avec un commentaire
//     de référence dans convex/social.ts pour rappeler la source de vérité.
//
// Si vous changez une valeur ici, mettez aussi à jour convex/social.ts :
//   - `buildCaption` (~ligne 253) pour SOCIAL_CAPTION_DESCRIPTION_MAX
// -------------------------------------------------------------------------------------------------

/**
 * Longueur maximale (en caractères) du segment "description" inséré dans la
 * caption envoyée à Facebook + Instagram via Zernio. Au-delà, la description
 * est tronquée et un "…" est ajouté.
 *
 * Pourquoi 400 :
 *   Instagram limite la caption totale à ~2200 caractères. La caption Osy-Immo
 *   contient aussi un titre, des stats (prix · surface · pièces · ville), un
 *   lien et des hashtags — soit ~100 chars de plomberie. En réservant 400 chars
 *   à la description, on garde une marge confortable sous le plafond IG tout
 *   en laissant un texte substantiel.
 *
 * Note : TikTok n'utilise PAS du tout la description — un titre indépendant
 * de 90 chars maximum est généré séparément depuis type+ville+prix
 * (cf. `buildTikTokTitle` dans convex/social.ts).
 */
export const SOCIAL_CAPTION_DESCRIPTION_MAX = 400;
