// convex/social.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Publication automatique des annonces sur Facebook + Instagram + TikTok via Zernio.
//        Les comptes ciblés sont découverts à la volée via GET /v1/accounts —
//        connecte/déconnecte tes réseaux dans le dashboard Zernio, ça se propage
//        automatiquement (pas d'env var par-plateforme à gérer).
//
//  Déclenchement :
//   - convex/properties.ts:update() schedule cette action quand status passe
//     draft → active (transition initiale uniquement, jamais re-postée).
//   - Le scheduler.runAfter(0, ...) garantit que la mutation principale n'est
//     PAS bloquée par l'appel HTTP externe à Zernio (qui peut prendre quelques s).
//
//  Architecture (calquée 1:1 sur convex/emails.ts) :
//   1. internalQuery preparePost
//        - vérifie l'idempotence (existing row in socialPosts ?)
//        - charge la propriété + construit la caption FR
//        - proxifie les URLs d'images via osy-immo.com (lib/images.ts)
//   2. internalMutation reserveSocialPost
//        - INSERT socialPosts {status: "pending"} → verrou idempotent
//   3. internalAction publishToSocials
//        - orchestrateur : query → reserve → fetch HTTP → finalize
//   4. internalMutation finalizeSocialPost
//        - patch la ligne avec le résultat (published / failed / skipped_no_images)
//
//  Fallback no-op : si l'une des 4 env vars Zernio manque, on log un warning
//  et on skippe. Permet de déployer le code AVANT d'avoir configuré Zernio.
//
//  Idempotence :
//   - Barrière 1 (mutation properties.update) : ne schedule que sur première transition active
//   - Barrière 2 (preparePost) : lookup socialPosts.by_property → skip si row existe
//   → Aucun risque de doublon, même sur double clic UI ou re-passage active→draft→active.
//
//  Compte central Osy-Immo : toutes les annonces postent sur la même Page FB
//  + même compte IG Business (pas d'OAuth par-utilisateur). Décision MVP — voir
//  le plan de roadmap pour une éventuelle évolution vers les comptes individuels.
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { proxifyImageUrl } from "./lib/images";
import { auth } from "./auth";

// URL publique du frontend, pour construire le lien "Voir l'annonce" dans la caption.
const APP_URL =
  process.env.APP_URL ?? process.env.SITE_URL ?? "http://localhost:3000";

// API REST Zernio — voir https://docs.zernio.com et zernio.com/llms.txt pour la spec.
const ZERNIO_BASE_URL = "https://zernio.com/api/v1";

// Limite de médias dans un carrousel — on prend le PLUS PETIT dénominateur des
// plateformes ciblées pour rester compatible partout :
//   - Instagram : 10 max
//   - TikTok Photo Mode : 35 max
//   - Facebook : pas de limite stricte documentée
// Donc on tronque à 10 (sinon IG refuserait le post entier alors qu'on envoie
// la même liste de médias aux trois plateformes en une seule requête Zernio).
const ZERNIO_CAROUSEL_MAX = 10;

// Plateformes qu'on cible volontairement dans Osy-Immo. Si l'admin connecte
// d'autres réseaux dans le dashboard Zernio (LinkedIn, X, Threads, etc.), ils
// seront IGNORÉS — on ne publie pas dessus sans validation explicite côté code
// (la caption et le format ne sont pas forcément adaptés à toutes les niches).
const TARGET_PLATFORMS = ["facebook", "instagram", "tiktok"] as const;
type TargetPlatform = (typeof TARGET_PLATFORMS)[number];

// ---------------------------------------------------------------------------
// Helper : résout l'identifiant du profile Zernio à utiliser pour publier.
//
// Stratégie :
//   1. Si ZERNIO_PROFILE_ID est défini en env var → on l'utilise tel quel
//      (override explicite, utile si l'admin a plusieurs profiles dans son
//      compte Zernio et veut choisir lequel sert pour Osy-Immo).
//   2. Sinon → GET /v1/profiles et on prend :
//        - le profile marqué `isDefault: true` s'il existe
//        - sinon, le premier de la liste (cas 99% : un seul profile)
//
// Renvoie null si le compte Zernio n'a aucun profile (cas anormal — l'admin
// doit en créer un dans le dashboard).
// ---------------------------------------------------------------------------
async function resolveProfileId(apiKey: string): Promise<string | null> {
  // Override explicite via env var (priorité absolue, évite un appel HTTP)
  const fromEnv = process.env.ZERNIO_PROFILE_ID;
  if (fromEnv) return fromEnv;

  const res = await fetch(`${ZERNIO_BASE_URL}/profiles`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(
      `GET /v1/profiles a renvoyé ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`
    );
  }
  const json = (await res.json()) as {
    profiles: Array<{ _id: string; name?: string; isDefault?: boolean }>;
  };
  if (json.profiles.length === 0) return null;

  // Priorité au profile marqué "par défaut" dans Zernio.
  const def = json.profiles.find((p) => p.isDefault === true);
  if (def) return def._id;

  // Sinon, on prend le premier. Si plusieurs profiles existent sans default,
  // on log un warning pour signaler à l'admin qu'il peut/devrait préciser
  // ZERNIO_PROFILE_ID pour lever toute ambiguïté.
  if (json.profiles.length > 1) {
    console.warn(
      `[social] ${json.profiles.length} profiles Zernio trouvés sans default — on utilise "${json.profiles[0].name ?? json.profiles[0]._id}". Set ZERNIO_PROFILE_ID pour choisir explicitement.`
    );
  }
  return json.profiles[0]._id;
}

// ---------------------------------------------------------------------------
// Helper : récupère dynamiquement les comptes sociaux connectés au profil
// Zernio (Facebook Page, Instagram Business, TikTok Business).
//
// Pourquoi à la volée plutôt qu'en env vars ?
//   - Évite à l'admin de gérer 3-5 env vars (1 par plateforme) — il configure
//     juste ZERNIO_API_KEY + ZERNIO_PROFILE_ID, le reste se résout tout seul.
//   - Auto-détecte les nouveaux réseaux connectés dans le dashboard Zernio :
//     ex. ajouter TikTok plus tard ne demande aucun redéploiement / aucune
//     mise à jour d'env var.
//   - Si l'admin déconnecte temporairement un compte (re-OAuth, ban Meta…),
//     on évite de poster vers un accountId obsolète qui ferait échouer toute
//     la requête — on publie juste sur ceux qui restent.
//
// Coût : 1 appel HTTP supplémentaire (~100-200 ms) par publication. Acceptable
// vu qu'on publie de l'ordre de quelques annonces par jour. Si la latence ou
// le quota devient un souci, on pourra cacher en table Convex avec TTL ~1h.
//
// Renvoie un map { facebook?: id, instagram?: id, tiktok?: id }. Une plateforme
// absente du map signifie "pas connectée" (ou désactivée côté Zernio).
// ---------------------------------------------------------------------------
async function fetchConnectedAccounts(
  apiKey: string,
  profileId: string
): Promise<Partial<Record<TargetPlatform, string>>> {
  const url = `${ZERNIO_BASE_URL}/accounts?profileId=${encodeURIComponent(profileId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    // On laisse l'appelant gérer l'erreur (log + status="failed").
    throw new Error(
      `GET /v1/accounts a renvoyé ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`
    );
  }
  const json = (await res.json()) as {
    accounts: Array<{ _id: string; platform: string; isActive?: boolean }>;
  };
  // Index par plateforme. On filtre :
  //   - les comptes désactivés (isActive === false)
  //   - les plateformes non ciblées (LinkedIn, Twitter, etc. — laissées intactes)
  const map: Partial<Record<TargetPlatform, string>> = {};
  for (const acc of json.accounts) {
    if (acc.isActive === false) continue;
    if ((TARGET_PLATFORMS as readonly string[]).includes(acc.platform)) {
      // Au cas où plusieurs comptes pour la même plateforme : on garde le 1er
      // (l'admin doit avoir UN SEUL compte central par plateforme dans Zernio).
      if (!map[acc.platform as TargetPlatform]) {
        map[acc.platform as TargetPlatform] = acc._id;
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Helpers de formatage — purement utilitaires, pas d'effet de bord.
// Extraits du gros bloc pour rester lisibles et testables séparément si besoin.
// ---------------------------------------------------------------------------

/**
 * Formate un prix en FCFA, format français (espaces fines).
 * Ajoute " / mois" pour les locations, rien pour les ventes.
 *
 * Exemple : formatPriceFCFA(350000, "rent") → "350 000 FCFA / mois"
 *           formatPriceFCFA(45000000, "sale") → "45 000 000 FCFA"
 */
function formatPriceFCFA(price: number, listingType: "sale" | "rent"): string {
  const formatted = price.toLocaleString("fr-FR");
  return listingType === "rent"
    ? `${formatted} FCFA / mois`
    : `${formatted} FCFA`;
}

/**
 * Convertit le `type` enum interne en libellé FR lisible pour la caption.
 * Cohérent avec ce qu'utilise le frontend (cf. src/lib/property-labels.ts si présent).
 */
function formatPropertyType(t: string): string {
  return (
    ({
      apartment: "Appartement",
      house: "Maison",
      land: "Terrain",
      commercial: "Local commercial",
    } as Record<string, string>)[t] ?? "Bien immobilier"
  );
}

/**
 * Construit la caption complète du post social (FR, contexte Cameroun).
 *
 * Format type :
 *   🏠 Maison à louer — Douala
 *
 *   350 000 FCFA / mois · 120 m² · 4 pièces · Douala
 *
 *   <description tronquée à 400 chars>
 *
 *   Voir l'annonce 👉 https://osy-immo.com/p/<6chars>
 *
 *   #OsyImmo #ImmobilierCameroun #Douala
 *
 * Choix de design :
 *   - Pas de markdown : Instagram et Facebook ignorent les ** et autres formats.
 *   - Sauts de ligne explicites (\n) — bien rendus par les deux plateformes.
 *   - Description tronquée à 400 chars car IG limite à ~2200 chars total caption,
 *     et on veut garder de la marge pour le hashtag + le lien.
 *   - Hashtag #<ville> dynamique en plus des deux hashtags fixes (branding + niche).
 */
function buildCaption(p: {
  description: string;
  price: number;
  city: string;
  type: string;
  listingType: "sale" | "rent";
  surface?: number;
  rooms?: number;
  url: string;
}): string {
  const verb = p.listingType === "rent" ? "à louer" : "à vendre";
  const type = formatPropertyType(p.type);
  // Stats compactes séparées par des points médians — pattern Instagram populaire.
  const stats = [
    formatPriceFCFA(p.price, p.listingType),
    p.surface ? `${p.surface} m²` : null,
    p.rooms ? `${p.rooms} pièces` : null,
    p.city,
  ]
    .filter(Boolean)
    .join(" · ");
  // Limite 400 = SOCIAL_CAPTION_DESCRIPTION_MAX (cf. src/lib/social-limits.ts).
  // Convex ne peut pas importer depuis src/, donc valeur dupliquée — si vous
  // changez ici, synchronisez aussi le fichier ci-dessus. Le frontend l'utilise
  // pour afficher un compteur en temps réel dans le formulaire d'annonce.
  const desc =
    p.description.length > 400
      ? p.description.slice(0, 397) + "…"
      : p.description;
  // Hashtag dynamique de la ville (sans espaces : "New Bell" → "#NewBell")
  const cityTag = "#" + p.city.replace(/\s+/g, "");
  return `🏠 ${type} ${verb} — ${p.city}

${stats}

${desc}

Voir l'annonce 👉 ${p.url}

#OsyImmo #ImmobilierCameroun ${cityTag}`;
}

/**
 * Construit un titre TikTok COURT (≤ 90 caractères).
 *
 * Pourquoi un titre séparé de buildCaption ?
 *   En mode photo (slideshow), TikTok utilise le `content` du post comme TITRE
 *   et le plafonne à 90 caractères. Notre caption FB/IG fait ~280 caractères →
 *   Zernio renvoie HTTP 400 et REJETTE LE POST ENTIER (les 3 plateformes d'un
 *   coup, puisqu'on envoie une seule requête multi-plateformes). On fournit
 *   donc à TikTok un titre dédié via `customContent` (override par plateforme).
 *
 * Format : "🏠 Appartement à vendre — Yaounde · 55 FCFA"
 *   - le prix est ajouté seulement s'il tient sous 90 caractères ;
 *   - sinon on garde juste la 1re ligne (type + verbe + ville) ;
 *   - garde-fou final : troncature à 89 + "…" pour ne jamais dépasser 90.
 *
 * Exemple : buildTikTokTitle({ type:"apartment", verb sale, city:"Yaounde", price:55 })
 *           → "🏠 Appartement à vendre — Yaounde · 55 FCFA"
 */
function buildTikTokTitle(p: {
  price: number;
  city: string;
  type: string;
  listingType: "sale" | "rent";
  shortUrl?: string;
}): string {
  const verb = p.listingType === "rent" ? "à louer" : "à vendre";
  const base = `🏠 ${formatPropertyType(p.type)} ${verb} — ${p.city}`;
  // Stratégie de remplissage du titre TikTok sous la limite stricte 90 chars.
  // Priorité décroissante : URL > Prix > Base seule.
  // Justification : sur TikTok le visiteur RECHERCHE le clic — l'URL est plus
  // utile que le prix (qu'il verra de toute façon une fois sur la fiche).
  // Le `shortUrl` est une URL courte de type "osy-immo.com/p/<6chars>" qui
  // tient confortablement dans la marge restante.

  // Cas 1 : prix + URL tiennent ensemble
  if (p.shortUrl) {
    const withPriceAndUrl = `${base} · ${formatPriceFCFA(p.price, p.listingType)} · ${p.shortUrl}`;
    if (withPriceAndUrl.length <= 90) return withPriceAndUrl;
    // Cas 2 : URL seule (sans prix) tient
    const withUrlOnly = `${base} · ${p.shortUrl}`;
    if (withUrlOnly.length <= 90) return withUrlOnly;
  }
  // Cas 3 : prix seul (sans URL) tient — comportement historique
  const withPrice = `${base} · ${formatPriceFCFA(p.price, p.listingType)}`;
  if (withPrice.length <= 90) return withPrice;
  // Cas 4 : dernier recours, base éventuellement tronquée
  return base.length <= 90 ? base : `${base.slice(0, 89)}…`;
}

// ---------------------------------------------------------------------------
// internalQuery : prépare le payload du post Zernio.
//
// Sépare la LECTURE (query, déterministe, sans effet de bord) de l'ENVOI
// (action, fetch HTTP) — c'est LE pattern Convex pour les actions externes.
//
// Cette query embarque aussi la vérification d'idempotence : si une ligne
// socialPosts existe déjà pour ce propertyId, on signale `alreadyPosted: true`
// pour que l'action skip l'appel HTTP sans toucher à la base.
// ---------------------------------------------------------------------------
// Type de retour explicite pour `preparePost` — sinon l'inférence TS s'écrase
// en `any` côté callers (publishToSocials, retryFailedPlatforms) parce que la
// fonction est référencée via `internal.social.preparePost` (cycle d'imports
// transitoire).
type PreparedPayload = {
  alreadyPosted: false;
  mediaUrls: string[];
  // Type des mediaItems envoyés à Zernio :
  //   - "image" → carrousel photos (TikTok Photo Mode, IG carousel, FB photo)
  //   - "video" → post vidéo natif (TikTok Video Mode, IG Reels, FB Watch)
  // Calculé dans preparePost selon p.socialMediaChoice + présence de p.videos.
  mediaType: "image" | "video";
  caption: string;
  tiktokTitle: string;
};
type PreparePostResult =
  | PreparedPayload
  | { alreadyPosted: true }
  | null;

export const preparePost = internalQuery({
  args: {
    propertyId: v.id("properties"),
    // skipIdempotenceCheck=true : utilisé par retryFailedPlatforms pour pouvoir
    // re-publier alors qu'une row socialPosts existe déjà (avec status="partial").
    // Dans le flux normal (transition draft→active), on laisse à false.
    skipIdempotenceCheck: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { propertyId, skipIdempotenceCheck = false }
  ): Promise<PreparePostResult> => {
    // Barrière d'idempotence n°2 (la n°1 est dans properties.ts).
    // Si l'utilisateur clique 2× très vite ou re-publie après archive, on skip.
    // Sauf si l'appelant a explicitement demandé un retry (flag ci-dessus).
    if (!skipIdempotenceCheck) {
      const existing = await ctx.db
        .query("socialPosts")
        .withIndex("by_property", (q) => q.eq("propertyId", propertyId))
        .first();
      if (existing) return { alreadyPosted: true as const };
    }

    const p = await ctx.db.get(propertyId);
    if (!p) return null; // propriété supprimée entre-temps (très rare)

    // Bascule média selon le choix utilisateur (cf. baseFields.socialMediaChoice).
    // Défaut "images" pour les annonces existantes sans ce champ (rétro-compat).
    // Si l'utilisateur a coché "video" MAIS n'a pas uploadé de vidéo, on retombe
    // sur images (défense en profondeur — le radio est déjà disabled côté UI).
    const choice = p.socialMediaChoice ?? "images";
    const hasVideo = (p.videos?.length ?? 0) > 0;
    const useVideo = choice === "video" && hasVideo;
    const mediaType: "image" | "video" = useVideo ? "video" : "image";

    // Proxifie + filtre HTTPS (Zernio exige HTTPS pour fetcher les médias).
    // Pour les vidéos : on prend la 1ère (videos[0] = "vidéo principale" via
    // le pattern setAsPrimary du MediaUploader). Pour les images : carrousel
    // jusqu'à ZERNIO_CAROUSEL_MAX (10).
    const mediaUrls = useVideo
      ? [proxifyImageUrl(p.videos![0])].filter(
          (u): u is string => !!u && u.startsWith("https://")
        )
      : (p.images ?? [])
          .map((u) => proxifyImageUrl(u))
          .filter((u): u is string => !!u && u.startsWith("https://"))
          .slice(0, ZERNIO_CAROUSEL_MAX);

    // URL courte uniforme pour TOUS les réseaux sociaux (FB + IG + TikTok).
    // Avantage : un seul format de lien à partager → branding cohérent
    // ("osy-immo.com/p/abc123" reconnaissable) + plus court à recopier
    // depuis n'importe quelle plateforme.
    //
    // Si l'annonce n'a pas encore de shortSlug (annonces pré-backfill), on
    // retombe sur l'URL Convex longue — buildTikTokTitle filtrera de toute
    // façon si elle ne tient pas dans 90 chars sur TikTok, et FB/IG acceptent
    // les URLs longues sans souci.
    const shortUrl = p.shortSlug
      ? `${APP_URL}/p/${p.shortSlug}`
      : `${APP_URL}/properties/${propertyId}`;

    return {
      alreadyPosted: false as const,
      mediaUrls,
      mediaType,
      caption: buildCaption({
        description: p.description,
        price: p.price,
        city: p.city,
        type: p.type,
        listingType: p.listingType,
        surface: p.surface,
        rooms: p.rooms,
        // Short URL utilisée sur FB + IG dans le segment "Voir l'annonce 👉".
        // Pas de raison d'envoyer une URL différente par plateforme.
        url: shortUrl,
      }),
      // Titre court dédié à TikTok (≤ 90 car.) — injecté via customContent côté
      // action, voir buildTikTokTitle pour le détail de la contrainte TikTok.
      // Le `shortUrl` permet d'ajouter osy-immo.com/p/<6chars> dans le titre
      // (sinon une URL Convex longue de 67 chars dépasserait la limite 90).
      tiktokTitle: buildTikTokTitle({
        price: p.price,
        city: p.city,
        type: p.type,
        listingType: p.listingType,
        shortUrl,
      }),
    };
  },
});

// ---------------------------------------------------------------------------
// internalMutation : réserve une ligne socialPosts AVANT l'appel HTTP.
//
// Cette ligne en status "pending" sert de verrou : si une seconde action
// concurrente lit la table (via preparePost), elle verra cette row et skipera.
// On finalize ensuite (published/failed/skipped) via finalizeSocialPost.
// ---------------------------------------------------------------------------
export const reserveSocialPost = internalMutation({
  args: {
    propertyId: v.id("properties"),
    platforms: v.array(v.string()),
  },
  handler: async (ctx, { propertyId, platforms }) => {
    return await ctx.db.insert("socialPosts", {
      propertyId,
      platforms,
      status: "pending",
    });
  },
});

// ---------------------------------------------------------------------------
// internalMutation : finalise une ligne socialPosts (succès ou échec).
//
// Patch atomique de status + zernioPostId (si succès) ou errorMessage (si échec).
// ---------------------------------------------------------------------------
export const finalizeSocialPost = internalMutation({
  args: {
    id: v.id("socialPosts"),
    status: v.union(
      v.literal("pending"),
      v.literal("published"),
      v.literal("partial"),
      v.literal("failed"),
      v.literal("skipped_no_images")
    ),
    zernioPostId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    // Détail par plateforme (FB/IG/TikTok). Peuplé après le POST Zernio
    // (si déjà dispo dans la réponse) ou après reconcileSocialPost (GET).
    platformResults: v.optional(
      v.array(
        v.object({
          platform: v.string(),
          status: v.string(),
          platformPostUrl: v.optional(v.string()),
          platformPostId: v.optional(v.string()),
          errorMessage: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});

// ---------------------------------------------------------------------------
// internalAction : orchestre la publication Zernio.
//
//  Args : { propertyId } — passé par le scheduler.runAfter() depuis properties.ts
//
//  Étapes :
//   1. Lit les données via preparePost (idempotence + payload)
//   2. Vérifie la clé API Zernio (no-op si manquante)
//   2bis. Résout le profileId (env var > GET /v1/profiles), puis découvre les
//         comptes connectés via GET /v1/accounts
//   3. Si aucune image valide → enregistre skipped_no_images + return
//   4. Réserve une ligne (status=pending) → verrou idempotent
//   5. POST https://zernio.com/api/v1/posts (un seul appel multi-plateformes)
//   6. Finalize la ligne (published avec zernioPostId, OU failed avec erreur)
//
//  PAS de retry automatique : Zernio peut avoir effectivement posté côté
//  Facebook/Instagram malgré un 5xx renvoyé. Mieux vaut un échec visible
//  qu'un doublon en production. L'admin peut relancer manuellement via le
//  dashboard Zernio (POST /v1/posts/{id}/retry) ou un futur bouton UI.
// ---------------------------------------------------------------------------
export const publishToSocials = internalAction({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, { propertyId }) => {
    // 1) Prépare les données + check d'idempotence
    const data = await ctx.runQuery(internal.social.preparePost, {
      propertyId,
    });
    if (!data) {
      console.warn(`[social] Propriété ${propertyId} introuvable — skip.`);
      return;
    }
    if (data.alreadyPosted) {
      console.log(
        `[social] ${propertyId} a déjà été posté (row socialPosts existante) — skip.`
      );
      return;
    }

    // 2) Vérifie la config Zernio.
    //    UNE SEULE env var obligatoire : ZERNIO_API_KEY (bearer token).
    //    Tout le reste (profileId + accountIds par plateforme) est découvert
    //    dynamiquement via l'API Zernio :
    //      - ZERNIO_PROFILE_ID est optionnel (override pour les cas multi-profile)
    //      - Les accountIds FB/IG/TikTok sont fetched via GET /v1/accounts
    //    Fallback no-op identique à Resend si la clé manque.
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      console.warn(
        "[social] Zernio non configuré (ZERNIO_API_KEY manquant). Configure-la avec `npx convex env set ZERNIO_API_KEY zer_...` puis re-publie."
      );
      return;
    }

    // 2bis) Résout le profileId (env var > GET /v1/profiles), puis découvre
    //       les comptes sociaux connectés à ce profile.
    //       Tous les comptes manquants/désactivés sont simplement ignorés —
    //       on poste sur ceux qui restent. Si vraiment AUCUN compte ciblé n'est
    //       trouvé, on log + skip (probablement l'admin n'a pas fini l'OAuth).
    let profileId: string | null;
    let accounts: Partial<Record<TargetPlatform, string>>;
    try {
      profileId = await resolveProfileId(apiKey);
      if (!profileId) {
        console.warn(
          "[social] Aucun profile Zernio trouvé pour cette clé API. Crée-en un dans le dashboard Zernio puis re-publie."
        );
        return;
      }
      accounts = await fetchConnectedAccounts(apiKey, profileId);
    } catch (err) {
      console.error("[social] Échec discovery Zernio (profile/accounts):", err);
      return; // pas de row pending insérée — on retentera au prochain publish
    }
    const platforms = TARGET_PLATFORMS.filter((p) => accounts[p]);
    if (platforms.length === 0) {
      console.warn(
        "[social] Aucun compte Facebook/Instagram/TikTok connecté au profile Zernio. Fais l'OAuth dans le dashboard Zernio puis re-publie."
      );
      return;
    }

    // 3) Annonce sans image utilisable → on log + status "skipped_no_images"
    //    (pour traçabilité dans la table socialPosts) puis on s'arrête.
    if (data.mediaUrls.length === 0) {
      const id = await ctx.runMutation(internal.social.reserveSocialPost, {
        propertyId,
        platforms,
      });
      await ctx.runMutation(internal.social.finalizeSocialPost, {
        id,
        status: "skipped_no_images",
      });
      console.warn(
        `[social] ${propertyId} sans image HTTPS valide — post skippé.`
      );
      return;
    }

    // 4) Réserve la ligne en "pending" → si une seconde exécution concurrente
    //    arrive (peu probable mais possible), elle verra cette row via preparePost
    //    et skippera. Verrou d'idempotence côté base.
    const rowId = await ctx.runMutation(internal.social.reserveSocialPost, {
      propertyId,
      platforms,
    });

    // 5) Appel HTTP Zernio. Format précis du payload validé contre llms.txt :
    //    https://zernio.com/llms.txt
    //
    //    POST /v1/posts {
    //      profileId, publishNow, content, mediaItems[], platforms[], tiktokSettings?
    //    }
    //
    // Construit dynamiquement la liste `platforms[]` à partir des comptes
    // découverts plus haut. Chaque plateforme a son propre format de settings :
    //   - Facebook  : aucun (carousel auto si mediaItems.length >= 2)
    //   - Instagram : platformSpecificData.contentType = "carousel"
    //   - TikTok    : pas de platformSpecificData, mais un objet `tiktokSettings`
    //                 SÉPARÉ à la racine du body (cf. plus bas).
    const platformsPayload: Array<Record<string, any>> = platforms.map(
      (platform) => {
        const accountId = accounts[platform]!; // garanti par le filter ci-dessus
        if (platform === "instagram") {
          return {
            platform,
            accountId,
            platformSpecificData: {
              // "carousel" pour un post multi-images sur le feed IG.
              // Autres options Zernio : "feed", "story", "reels".
              contentType: "carousel",
            },
          };
        }
        if (platform === "tiktok") {
          return {
            platform,
            accountId,
            // TikTok mode photo utilise `content` comme TITRE de slideshow,
            // plafonné à 90 caractères. Notre caption FB/IG fait ~280 car. →
            // sans override, Zernio renvoie HTTP 400 et FAIT ÉCHOUER TOUT le
            // post multi-plateformes (FB + IG inclus). On substitue donc un
            // titre court via customContent (override de contenu par plateforme).
            customContent: data.tiktokTitle,
          };
        }
        // facebook : pas de platformSpecificData ni d'override de contenu
        // (la caption complète `content` lui convient parfaitement).
        return { platform, accountId };
      }
    );
    const includesTikTok = platforms.includes("tiktok");

    try {
      const res = await fetch(`${ZERNIO_BASE_URL}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileId,
          publishNow: true,
          content: data.caption,
          // Carrousel : suite d'images. Pas de vidéo (IG/TikTok refusent le mix
          // image+vidéo dans un même carrousel).
          mediaItems: data.mediaUrls.map((url) => ({
            type: data.mediaType,
            url,
          })),
          platforms: platformsPayload,
          // Settings TikTok obligatoires si on cible TikTok. Spec Zernio :
          //   - media_type "photo" → Photo Mode (carrousel jusqu'à 35 images)
          //   - privacy_level / allow_comment / allow_duet / allow_stitch : doivent
          //     être présents (sinon TikTok refuse le post côté Zernio).
          //   - content_preview_confirmed / express_consent_given : flags de
          //     consentement TikTok — on les met à true côté serveur puisque le
          //     compte central Osy-Immo a déjà accepté les conditions TikTok
          //     dans le dashboard Zernio au moment de l'OAuth.
          //   - commercial_content_type : on met "none" (valeur de l'exemple
          //     officiel Zernio) → AUCUNE divulgation commerciale, donc aucune
          //     sous-option à cocher. TikTok publie sans friction.
          //
          //     Historique des échecs en prod (à ne pas reproduire) :
          //       • "your_brand"    → valeur non reconnue par TikTok.
          //       • "brand_organic" → reconnue MAIS active la divulgation sans
          //         cocher le toggle « Your Brand » (que Zernio n'expose pas) →
          //         "Commercial content disclosure enabled but no option selected"
          //         → post TikTok en échec.
          //     Seul "none" passe de façon fiable via l'API Zernio actuelle.
          //
          //     ⚠️ Tradeoff : le post TikTok ne porte donc PAS le label « Your
          //     Brand ». Si la conformité l'exige un jour, il faudra les toggles
          //     dédiés (non documentés dans llms.txt — voir docs.zernio.com).
          ...(includesTikTok && {
            tiktokSettings: {
              // Bascule TikTok Photo Mode ↔ Video Mode selon le choix utilisateur
              // (cf. preparePost). Photo Mode = slideshow d'images, Video Mode =
              // post vidéo natif TikTok (Reels-like).
              media_type: data.mediaType === "video" ? "video" : "photo",
              privacy_level: "PUBLIC_TO_EVERYONE",
              allow_comment: true,
              allow_duet: true,
              allow_stitch: true,
              auto_add_music: true,
              content_preview_confirmed: true,
              express_consent_given: true,
              commercial_content_type: "none",
            },
          }),
        }),
      });

      // 6a) Échec HTTP : log + finalize "failed" avec le message tronqué.
      if (!res.ok) {
        const errText = (await res.text().catch(() => "")).slice(0, 200);
        console.error(`[social] Zernio a renvoyé ${res.status}: ${errText}`);
        await ctx.runMutation(internal.social.finalizeSocialPost, {
          id: rowId,
          status: "failed",
          errorMessage: `HTTP ${res.status}: ${errText}`,
        });
        return;
      }

      // 6b) Succès HTTP : on parse la réponse pour extraire :
      //     - L'ID Zernio (champ `_id` côté API Zernio, PAS `id` — bug corrigé)
      //     - Les statuts par plateforme si déjà fournis (publication parfois
      //       synchrone côté Zernio, parfois async — d'où le reconcile plus bas)
      //
      // Important : HTTP 2xx ne veut PAS dire "tout a été publié". Zernio renvoie
      // 2xx dès que la file de publication a accepté la demande. Le résultat
      // RÉEL par plateforme (TikTok refusé pour UX validation, etc.) n'est connu
      // qu'après quelques secondes, via GET /v1/posts/{id}.
      //
      // Stratégie :
      //   • Si la réponse POST contient déjà `platforms[].status` exploitables
      //     → on calcule le statut global tout de suite (published/partial/failed)
      //   • Sinon → on garde "pending" et on schedule un reconcile dans 15 s
      const json = (await res.json()) as {
        _id?: string;
        id?: string;
        status?: string;
        platforms?: Array<{
          platform?: string;
          status?: string;
          platformPostUrl?: string;
          platformPostId?: string;
          errorMessage?: string;
        }>;
      };
      const zernioPostId = json._id ?? json.id;

      // Extraction des statuts par plateforme (peut être vide si publication async)
      const platformResults = (json.platforms ?? [])
        .filter((p): p is { platform: string; status: string } & typeof p =>
          Boolean(p.platform && p.status)
        )
        .map((p) => ({
          platform: p.platform!,
          status: p.status!,
          platformPostUrl: p.platformPostUrl,
          platformPostId: p.platformPostId,
          errorMessage: p.errorMessage,
        }));

      // Calcul du statut global RÉEL (vs juste HTTP 2xx) :
      //   - Au moins une plateforme avec un status final connu → on peut décider
      //   - Sinon (Zernio nous renvoie juste {_id, status:"scheduled"}) → pending
      let globalStatus: "published" | "partial" | "failed" | "pending" = "pending";
      if (platformResults.length > 0) {
        const allOk = platformResults.every((p) => p.status === "published");
        const allKo = platformResults.every((p) => p.status === "failed");
        globalStatus = allOk ? "published" : allKo ? "failed" : "partial";
      }

      await ctx.runMutation(internal.social.finalizeSocialPost, {
        id: rowId,
        status: globalStatus,
        zernioPostId,
        platformResults:
          platformResults.length > 0 ? platformResults : undefined,
      });
      console.log(
        `[social] ✓ Post Zernio créé pour ${propertyId} (zernioPostId=${zernioPostId}, status initial=${globalStatus})`
      );

      // Si pending (publication asynchrone Zernio), schedule un reconcile
      // dans 15 s pour récupérer le vrai statut par plateforme via GET.
      // 15 s = compromis entre la latence d'affichage côté admin et la durée
      // typique de publication TikTok (qui peut prendre 5-10 s côté plateforme).
      if (globalStatus === "pending" && zernioPostId) {
        await ctx.scheduler.runAfter(
          15_000,
          internal.social.reconcileSocialPost,
          { socialPostId: rowId }
        );
      }
    } catch (err) {
      // Cas réseau (timeout, DNS, etc.) — on enregistre l'échec et on s'arrête.
      const msg = String(err).slice(0, 200);
      console.error("[social] fetch Zernio a planté:", msg);
      await ctx.runMutation(internal.social.finalizeSocialPost, {
        id: rowId,
        status: "failed",
        errorMessage: msg,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// internalQuery : lit une row socialPosts par id. Utilisé par reconcile.
// ---------------------------------------------------------------------------
export const getSocialPost = internalQuery({
  args: { id: v.id("socialPosts") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// ---------------------------------------------------------------------------
// internalQuery : lit la row socialPosts par propertyId. Utilisée par
// retryFailedPlatforms pour récupérer la dernière tentative + ses platformResults.
//
// Ordre "desc" : on veut la row LA PLUS RÉCENTE — si plusieurs retries ont
// été faits, on s'appuie sur le dernier état connu pour décider quelles
// plateformes sont encore en échec.
// ---------------------------------------------------------------------------
export const getSocialPostByProperty = internalQuery({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, { propertyId }) => {
    return await ctx.db
      .query("socialPosts")
      .withIndex("by_property", (q) => q.eq("propertyId", propertyId))
      .order("desc")
      .first();
  },
});

// ---------------------------------------------------------------------------
// internalAction : récupère le statut RÉEL d'un post Zernio par GET et met
// à jour la row socialPosts en conséquence.
//
// Pourquoi : Zernio publie de façon asynchrone. POST /v1/posts renvoie 2xx
// dès que la file accepte, mais le résultat par plateforme (TikTok publié ?
// validé ? rejeté ?) n'est connu qu'après quelques secondes. On schedule
// donc cet appel 15 s après le POST initial pour réconcilier l'état.
//
// Idempotente : peut être ré-appelée sans danger (un patch).
// ---------------------------------------------------------------------------
export const reconcileSocialPost = internalAction({
  args: { socialPostId: v.id("socialPosts") },
  handler: async (ctx, { socialPostId }) => {
    const row = await ctx.runQuery(internal.social.getSocialPost, {
      id: socialPostId,
    });
    if (!row || !row.zernioPostId) {
      console.warn(
        `[social] reconcileSocialPost: row ou zernioPostId introuvable pour ${socialPostId}`
      );
      return;
    }

    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) return; // no-op silencieux si pas configuré

    const url = `${ZERNIO_BASE_URL}/posts/${row.zernioPostId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.error(
        `[social] reconcile GET /posts/${row.zernioPostId} a renvoyé ${res.status}`
      );
      return;
    }
    // ⚠️ GET /v1/posts/{id} encapsule le résultat dans `{post: {...}}`,
    //    contrairement au POST /v1/posts (racine directe). On gère les 2
    //    formats pour rester robuste si Zernio harmonise plus tard.
    const raw = (await res.json()) as {
      post?: {
        platforms?: Array<{
          platform?: string;
          status?: string;
          platformPostUrl?: string;
          platformPostId?: string;
          errorMessage?: string;
        }>;
      };
      platforms?: Array<{
        platform?: string;
        status?: string;
        platformPostUrl?: string;
        platformPostId?: string;
        errorMessage?: string;
      }>;
    };
    const data = raw.post ?? raw;

    const platformResults = (data.platforms ?? [])
      .filter((p): p is { platform: string; status: string } & typeof p =>
        Boolean(p.platform && p.status)
      )
      .map((p) => ({
        platform: p.platform!,
        status: p.status!,
        platformPostUrl: p.platformPostUrl,
        platformPostId: p.platformPostId,
        errorMessage: p.errorMessage,
      }));

    if (platformResults.length === 0) {
      console.warn(
        `[social] reconcile: aucune plateforme dans la réponse pour ${row.zernioPostId}`
      );
      return;
    }

    // Statut global recalculé selon le détail par plateforme.
    const allOk = platformResults.every((p) => p.status === "published");
    const allKo = platformResults.every((p) => p.status === "failed");
    const status: "published" | "partial" | "failed" = allOk
      ? "published"
      : allKo
        ? "failed"
        : "partial";

    await ctx.runMutation(internal.social.finalizeSocialPost, {
      id: socialPostId,
      status,
      platformResults,
    });
    console.log(
      `[social] ✓ reconcile ${socialPostId} → ${status} (${platformResults
        .map((p) => `${p.platform}:${p.status}`)
        .join(", ")})`
    );
  },
});

// ===================================================================================
// action publique : re-tente la publication SUR LES PLATEFORMES EN ÉCHEC
// pour une propriété déjà publiée (status=partial ou failed).
//
// Pourquoi en `action` publique :
//   - Lançable via `npx convex run --prod social:retryFailedPlatforms`
//     pour les ops (ce qu'on va faire pour les 2 posts Maison SIC + Yaoundé).
//   - Peut être ensuite branchée à un bouton "Réessayer" dans le dashboard.
//
// Sécurité :
//   - Lit/écrit seulement la row socialPosts existante de la propriété.
//   - Ne crée PAS de nouvelle row (réutilise celle qui existe).
//   - Si aucune plateforme en échec → no-op.
//
// Comportement :
//   1. Récupère la row + les plateformes en `status: "failed"`.
//   2. Reconstruit le payload (mediaUrls, caption, tiktokTitle) via preparePost
//      avec skipIdempotenceCheck=true.
//   3. POST Zernio avec platforms[] limité aux failed.
//   4. Patch la row avec les nouveaux platformResults (fusion : on garde
//      les plateformes déjà published, on remplace celles retentées).
// ===================================================================================
// Type de retour explicite pour `retryFailedPlatforms` — TS ne peut pas
// l'inférer seul (références circulaires via internal.social.*). On garde
// `any` pour `newSocialPostId` parce que l'Id<"socialPosts"> dépend du
// _generated/dataModel qui propage le `any` ici aussi.
type RetryResult =
  | { error: string; failedPlatforms?: string[] }
  | {
      message: string;
      currentStatus: string;
      platformResults: unknown[];
    }
  | {
      success: true;
      retriedPlatforms: string[];
      newZernioPostId: string | undefined;
      newSocialPostId: unknown;
      message: string;
    };

// Forme typée d'une entrée platformResults (copie de la signature schema.ts).
type PlatformResult = {
  platform: string;
  status: string;
  platformPostUrl?: string;
  platformPostId?: string;
  errorMessage?: string;
};

export const retryFailedPlatforms = action({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, { propertyId }): Promise<RetryResult> => {
    // 0) Garde-fou owner. Sans ce check, n'importe quel utilisateur authentifié
    //    (ou non) pourrait déclencher un retry sur n'importe quelle annonce,
    //    consommant le quota Zernio et postant du contenu non maîtrisé.
    //    Note : les actions de debug (`debugSeedZernioIdAndReconcile`, etc.)
    //    n'ont PAS ce check car elles sont destinées aux ops via convex run.
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return { error: "Authentification requise." };
    const property = (await ctx.runQuery(
      internal.social.getPropertyForRepost,
      { propertyId }
    )) as { ownerId: string } | null;
    if (!property) return { error: "Annonce introuvable." };
    if (property.ownerId !== userId)
      return { error: "Vous n'êtes pas propriétaire de cette annonce." };

    // 1) Récupère la row existante (cast nécessaire car runQuery est typé `any`
    //    quand on référence internal.social.* en cycle).
    const row = (await ctx.runQuery(
      internal.social.getSocialPostByProperty,
      { propertyId }
    )) as
      | {
          status: string;
          platformResults?: PlatformResult[];
        }
      | null;
    if (!row) {
      return {
        error:
          "Aucune row socialPosts pour cette propriété. Publie d'abord normalement.",
      };
    }

    // Identifie les plateformes à retenter
    const failedPlatforms: string[] = (row.platformResults ?? [])
      .filter((p: PlatformResult) => p.status === "failed")
      .map((p: PlatformResult) => p.platform);
    if (failedPlatforms.length === 0) {
      return {
        message:
          "Aucune plateforme en échec à retenter. Soit tout est OK, soit la row n'a pas encore été reconciliée.",
        currentStatus: row.status,
        platformResults: row.platformResults ?? [],
      };
    }

    // 2) Reconstruit le payload — skip idempotence vu qu'on retry
    const data = (await ctx.runQuery(internal.social.preparePost, {
      propertyId,
      skipIdempotenceCheck: true,
    })) as PreparePostResult;
    if (!data || data.alreadyPosted) {
      return { error: "Préparation du payload impossible." };
    }
    if (data.mediaUrls.length === 0) {
      return { error: "Aucune image HTTPS valide pour cette propriété." };
    }

    // 3) Résout profile + accounts (peut avoir changé depuis la 1ère publication)
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) return { error: "ZERNIO_API_KEY non configurée." };
    const profileId = await resolveProfileId(apiKey);
    if (!profileId) return { error: "Aucun profile Zernio." };
    const accounts = await fetchConnectedAccounts(apiKey, profileId);

    // On ne retry que les plateformes qui sont à la fois :
    //   - en échec dans la row
    //   - actuellement connectées côté Zernio (sinon ça échouera encore)
    const retryablePlatforms: string[] = failedPlatforms.filter(
      (p: string) =>
        (TARGET_PLATFORMS as readonly string[]).includes(p) &&
        accounts[p as TargetPlatform] !== undefined
    );
    if (retryablePlatforms.length === 0) {
      return {
        error: "Plateformes en échec non connectées à Zernio. Refais l'OAuth.",
        failedPlatforms,
      };
    }

    // 4) POST Zernio limité aux plateformes à retenter
    const platformsPayload: Array<Record<string, any>> = retryablePlatforms.map(
      (platform: string) => {
        const accountId = accounts[platform as TargetPlatform]!;
        if (platform === "instagram") {
          return {
            platform,
            accountId,
            platformSpecificData: { contentType: "carousel" },
          };
        }
        if (platform === "tiktok") {
          return { platform, accountId, customContent: data.tiktokTitle };
        }
        return { platform, accountId };
      }
    );
    const includesTikTok = retryablePlatforms.includes("tiktok");

    const res: Response = await fetch(`${ZERNIO_BASE_URL}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profileId,
        publishNow: true,
        content: data.caption,
        mediaItems: data.mediaUrls.map((url: string) => ({
          type: data.mediaType,
          url,
        })),
        platforms: platformsPayload,
        ...(includesTikTok && {
          tiktokSettings: {
            // Bascule Photo / Video Mode selon data.mediaType (cf. preparePost)
            media_type: data.mediaType === "video" ? "video" : "photo",
            privacy_level: "PUBLIC_TO_EVERYONE",
            allow_comment: true,
            allow_duet: true,
            allow_stitch: true,
            auto_add_music: true,
            content_preview_confirmed: true,
            express_consent_given: true,
            commercial_content_type: "none",
          },
        }),
      }),
    });

    if (!res.ok) {
      const errText = (await res.text().catch(() => "")).slice(0, 300);
      return { error: `Zernio HTTP ${res.status}: ${errText}` };
    }
    const json = (await res.json()) as { _id?: string; id?: string };
    const newZernioPostId = json._id ?? json.id;

    // 5) Schedule un reconcile pour récupérer le vrai statut TikTok après ~15 s.
    //    On crée une NOUVELLE row pour ce retry (au lieu de patcher l'ancienne) :
    //    ça garde l'historique des tentatives, et le reconcile pourra correctement
    //    update les platformResults de cette nouvelle row.
    //
    //    L'ancienne row reste en "partial" — elle représente la 1ère tentative,
    //    qui est restée partielle. La row de retry représente la 2e.
    const newRowId: unknown = await ctx.runMutation(
      internal.social.reserveSocialPost,
      {
        propertyId,
        platforms: retryablePlatforms,
      }
    );
    await ctx.runMutation(internal.social.finalizeSocialPost, {
      id: newRowId as any,
      status: "pending",
      zernioPostId: newZernioPostId,
    });
    await ctx.scheduler.runAfter(
      15_000,
      internal.social.reconcileSocialPost,
      { socialPostId: newRowId as any }
    );

    return {
      success: true,
      retriedPlatforms: retryablePlatforms,
      newZernioPostId,
      newSocialPostId: newRowId,
      message: `Retry lancé pour ${retryablePlatforms.join(", ")}. Le statut réel sera disponible dans ~15 s (reconcileSocialPost).`,
    };
  },
});

// ===================================================================================
// query publique : pour CHAQUE annonce du user connecté, renvoie le DERNIER
// socialPosts row associé. Utilisé par le dashboard pour afficher les badges
// statut FB/IG/TikTok par annonce.
//
// Format : Map<propertyId, latestSocialPost>. Un propertyId absent du map
// signifie "aucune publication tentée" (annonce jamais passée active).
//
// Sécurité : ne renvoie QUE les rows des annonces dont ownerId === userId.
// La row publique ne contient pas de données sensibles (zernioPostId, status,
// platformResults), donc pas de filtrage colonne supplémentaire.
// ===================================================================================
export const listSocialPostsForOwner = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return {};

    // 1) Récupère les propertyIds du user. On évite un scan complet de socialPosts
    //    en partant des propriétés (volume attendu : qq dizaines max par user).
    const myProperties = await ctx.db
      .query("properties")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();

    // 2) Pour chaque propertyId, on AGRÈGE toutes les rows socialPosts.
    //
    //    Pourquoi pas juste la plus récente ? Parce que les retry créent une
    //    nouvelle row (cf. retryFailedPlatforms) qui ne contient que les
    //    plateformes retentées. Ex :
    //      • Row 1 (originale)  : platforms=[fb, tiktok], FB published, TikTok failed
    //      • Row 2 (retry plus récent) : platforms=[tiktok], TikTok published
    //    Si on ne lit que Row 2, Facebook disparaît de l'UI alors qu'il
    //    a été publié avec succès. Bug visuel signalé par l'utilisateur.
    //
    //    Stratégie d'agrégation :
    //      - Parcourir les rows du PLUS RÉCENT au plus ancien (order desc)
    //      - Pour chaque platformResult rencontré, ne garder que la première
    //        occurrence de cette plateforme (= la plus récente)
    //      - Inclure aussi les plateformes ciblées (row.platforms) sans
    //        platformResult comme "pending" si jamais reconciliée
    //      - Recalculer le statut global agrégé : all published → published,
    //        all failed → failed, mix → partial
    const result: Record<string, any> = {};
    for (const property of myProperties) {
      const rows = await ctx.db
        .query("socialPosts")
        .withIndex("by_property", (q) => q.eq("propertyId", property._id))
        .order("desc")
        .collect();
      if (rows.length === 0) continue;

      // Map plateforme → dernier résultat connu (parcours desc, on prend
      // le 1er hit qui est donc le plus récent)
      type PR = {
        platform: string;
        status: string;
        platformPostUrl?: string;
        platformPostId?: string;
        errorMessage?: string;
      };
      const latestByPlatform = new Map<string, PR>();
      for (const row of rows) {
        // Priorité 1 : platformResults détaillés (sortie reconcileSocialPost)
        for (const pr of row.platformResults ?? []) {
          if (!latestByPlatform.has(pr.platform)) {
            latestByPlatform.set(pr.platform, pr);
          }
        }
        // Priorité 2 : plateformes ciblées sans résultat encore connu
        // (cas pending — publication asynchrone pas encore reconciliée).
        // On les marque "pending" pour qu'elles apparaissent quand même
        // dans la grille UI.
        for (const p of row.platforms) {
          if (!latestByPlatform.has(p)) {
            latestByPlatform.set(p, { platform: p, status: "pending" });
          }
        }
      }

      const aggregated = Array.from(latestByPlatform.values());
      const platforms = Array.from(latestByPlatform.keys());

      // Statut global recalculé sur l'union des plateformes
      let aggregateStatus: string;
      if (aggregated.length === 0) {
        aggregateStatus = "pending";
      } else if (aggregated.every((p) => p.status === "published")) {
        aggregateStatus = "published";
      } else if (aggregated.every((p) => p.status === "failed")) {
        aggregateStatus = "failed";
      } else if (aggregated.some((p) => p.status === "pending")) {
        aggregateStatus = "pending";
      } else {
        aggregateStatus = "partial";
      }

      // Métadonnées de la row la plus récente (pour le retry UI : on relance
      // depuis l'ID le plus récent, et l'éventuel errorMessage global)
      const latestRow = rows[0]!;
      result[property._id] = {
        _id: latestRow._id,
        status: aggregateStatus,
        platforms,
        platformResults: aggregated,
        zernioPostId: latestRow.zernioPostId,
        errorMessage: latestRow.errorMessage,
        _creationTime: latestRow._creationTime,
      };
    }
    return result;
  },
});

// ===================================================================================
// action publique : re-poste une annonce sur TOUTES les plateformes connectées,
// en bypassant la barrière d'idempotence. Utilisé quand l'utilisateur modifie
// son annonce (prix, photos, titre) et veut faire savoir la mise à jour à
// ses followers.
//
// Différence avec retryFailedPlatforms :
//   - retryFailedPlatforms : relance UNIQUEMENT les `failed` (FB/IG/TikTok)
//   - republishToSocials   : re-poste sur TOUTES les plateformes connectées
//                            (crée un nouveau post côté Zernio, donc un nouveau
//                            post sur FB/IG/TikTok — risque de doublon si abusé)
//
// Sécurité :
//   - Owner-only : vérifie que le user connecté est bien le propriétaire.
//   - Pas de cooldown automatique → c'est l'utilisateur qui décide quand
//     re-publier (via le bouton "Enregistrer & re-publier" du formulaire).
//     Risque de spam contrôlé par l'utilisateur, pas par le système.
//
// Comportement :
//   1. Vérifie owner.
//   2. Construit le payload (caption, mediaUrls, tiktokTitle) — skip idempotence.
//   3. Résout profile + comptes connectés.
//   4. POST Zernio multi-plateformes (FB + IG + TikTok si dispo).
//   5. Crée une nouvelle row socialPosts en pending → reconcile à +15s.
// ===================================================================================
export const republishToSocials = action({
  args: { propertyId: v.id("properties") },
  handler: async (
    ctx,
    { propertyId }
  ): Promise<
    | { error: string }
    | {
        success: true;
        platforms: string[];
        newZernioPostId: string | undefined;
        newSocialPostId: unknown;
        message: string;
      }
  > => {
    // 1) Garde-fou owner. La query Convex `properties.get` ne vérifie pas la
    //    propriété — on duplique le check ici car c'est une action externe.
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return { error: "Authentification requise." };

    const property = (await ctx.runQuery(internal.social.getPropertyForRepost, {
      propertyId,
    })) as { ownerId: string } | null;
    if (!property) return { error: "Annonce introuvable." };
    if (property.ownerId !== userId)
      return { error: "Vous n'êtes pas propriétaire de cette annonce." };

    // 2) Reconstruit le payload (skip idempotence)
    const data = (await ctx.runQuery(internal.social.preparePost, {
      propertyId,
      skipIdempotenceCheck: true,
    })) as PreparePostResult;
    if (!data || data.alreadyPosted) {
      return { error: "Préparation du payload impossible." };
    }
    if (data.mediaUrls.length === 0) {
      return { error: "Ajoute au moins une image HTTPS valide à l'annonce." };
    }

    // 3) Résolution Zernio (cohérent avec publishToSocials)
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) return { error: "ZERNIO_API_KEY non configurée." };
    const profileId = await resolveProfileId(apiKey);
    if (!profileId) return { error: "Aucun profile Zernio." };
    const accounts = await fetchConnectedAccounts(apiKey, profileId);
    const platforms = TARGET_PLATFORMS.filter((p) => accounts[p]);
    if (platforms.length === 0) {
      return {
        error: "Aucun compte FB/IG/TikTok connecté à Zernio. Refais l'OAuth.",
      };
    }

    // 4) POST Zernio multi-plateformes (identique à publishToSocials)
    const platformsPayload: Array<Record<string, any>> = platforms.map(
      (platform) => {
        const accountId = accounts[platform]!;
        if (platform === "instagram") {
          return {
            platform,
            accountId,
            platformSpecificData: { contentType: "carousel" },
          };
        }
        if (platform === "tiktok") {
          return { platform, accountId, customContent: data.tiktokTitle };
        }
        return { platform, accountId };
      }
    );
    const includesTikTok = platforms.includes("tiktok");

    const res: Response = await fetch(`${ZERNIO_BASE_URL}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profileId,
        publishNow: true,
        content: data.caption,
        mediaItems: data.mediaUrls.map((url: string) => ({
          type: data.mediaType,
          url,
        })),
        platforms: platformsPayload,
        ...(includesTikTok && {
          tiktokSettings: {
            // Bascule Photo / Video Mode selon data.mediaType (cf. preparePost)
            media_type: data.mediaType === "video" ? "video" : "photo",
            privacy_level: "PUBLIC_TO_EVERYONE",
            allow_comment: true,
            allow_duet: true,
            allow_stitch: true,
            auto_add_music: true,
            content_preview_confirmed: true,
            express_consent_given: true,
            commercial_content_type: "none",
          },
        }),
      }),
    });
    if (!res.ok) {
      const errText = (await res.text().catch(() => "")).slice(0, 300);
      return { error: `Zernio HTTP ${res.status}: ${errText}` };
    }
    const json = (await res.json()) as { _id?: string; id?: string };
    const newZernioPostId = json._id ?? json.id;

    // 5) Crée une nouvelle row + schedule un reconcile pour avoir le statut
    //    réel par plateforme dans ~15 s.
    const newRowId: unknown = await ctx.runMutation(
      internal.social.reserveSocialPost,
      { propertyId, platforms: [...platforms] }
    );
    await ctx.runMutation(internal.social.finalizeSocialPost, {
      id: newRowId as any,
      status: "pending",
      zernioPostId: newZernioPostId,
    });
    await ctx.scheduler.runAfter(
      15_000,
      internal.social.reconcileSocialPost,
      { socialPostId: newRowId as any }
    );

    return {
      success: true,
      platforms: [...platforms],
      newZernioPostId,
      newSocialPostId: newRowId,
      message: `Re-publication lancée sur ${platforms.join(", ")}.`,
    };
  },
});

// ---------------------------------------------------------------------------
// internalQuery helper : lit une propriété par id pour les actions de retry/repost.
// Couplé à social.ts pour éviter une dépendance croisée properties.ts → social.ts.
// ---------------------------------------------------------------------------
export const getPropertyForRepost = internalQuery({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, { propertyId }) => {
    return await ctx.db.get(propertyId);
  },
});

// ===================================================================================
// DEBUG : fait juste le GET /v1/posts/{id} brut, retourne la réponse complète.
// Utile pour comprendre le format que renvoie Zernio sur ce endpoint
// (différent de la liste /v1/posts qui inclut platforms[]).
// ===================================================================================
// SÉCURITÉ : passé en internalAction suite audit security (Finding #1) — exposait
// l'API Zernio interne à n'importe quel visiteur. Toujours appelable via
// `npx convex run --prod social:debugGetZernioPostSingle` pour les ops.
export const debugGetZernioPostSingle = internalAction({
  args: { zernioPostId: v.string() },
  handler: async (_ctx, { zernioPostId }) => {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) return { error: "ZERNIO_API_KEY manquante." };
    const url = `${ZERNIO_BASE_URL}/posts/${zernioPostId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { status: res.status, rawTextPreview: text.slice(0, 1000) };
    }
    return { status: res.status, url, body: parsed };
  },
});

// ===================================================================================
// MIGRATION ONE-SHOT : patche le `zernioPostId` manquant sur une row existante
// puis déclenche immédiatement le reconcile pour récupérer le statut par
// plateforme.
//
// Pourquoi cette action existe :
//   Les rows socialPosts créées AVANT le fix de parsing (json.id → json._id)
//   n'ont pas de zernioPostId stocké. Du coup `reconcileSocialPost` ne peut
//   pas les traiter (il s'appuie sur ce champ pour le GET Zernio).
//
//   On peut récupérer manuellement le zernioPostId via debugInspectZernioPosts
//   (champ `_id` dans la réponse), puis le seed via cette action.
//
// Usage :
//   `npx convex run --prod social:debugSeedZernioIdAndReconcile \
//      '{"propertyId":"jd75snq1...","zernioPostId":"6a172e8085ecf27d10f346e2"}'`
//
// À retirer une fois les rows orphelines reconciliées (peu d'usage à long terme).
// ===================================================================================
// SÉCURITÉ : passé en internalAction suite audit security (Finding #1).
// C'est une MUTATION (modifie socialPosts.zernioPostId) — sans owner check
// l'exposition publique permettait de corrompre n'importe quelle row.
export const debugSeedZernioIdAndReconcile = internalAction({
  args: {
    propertyId: v.id("properties"),
    zernioPostId: v.string(),
  },
  handler: async (
    ctx,
    { propertyId, zernioPostId }
  ): Promise<
    | { error: string }
    | { success: true; rowId: unknown; message: string }
  > => {
    // 1. Trouve la row existante par propertyId (la plus récente)
    const row = (await ctx.runQuery(
      internal.social.getSocialPostByProperty,
      { propertyId }
    )) as { _id: unknown; status: string } | null;
    if (!row) return { error: "Aucune row socialPosts pour cette propriété." };

    // 2. Patche le zernioPostId (status inchangé)
    await ctx.runMutation(internal.social.finalizeSocialPost, {
      id: row._id as any,
      status: row.status as any,
      zernioPostId,
    });

    // 3. Lance le reconcile → GET /v1/posts/{zernioPostId} → met à jour
    //    platformResults + statut global. Idempotent, ré-exécutable sans risque.
    await ctx.runAction(internal.social.reconcileSocialPost, {
      socialPostId: row._id as any,
    });

    return {
      success: true,
      rowId: row._id,
      message:
        "Reconcile terminé. Vérifie socialPosts (status & platformResults), puis appelle retryFailedPlatforms si besoin.",
    };
  },
});

// ===================================================================================
// DEBUG : action publique pour interroger l'état réel des posts côté Zernio.
//
// Pourquoi en `action` publique (vs internalAction) :
//   - Lançable via `npx convex run --prod social:debugInspectZernioPosts`
//     sans avoir à passer par le frontend. Pratique pour le diagnostic ops.
//
// Sécurité :
//   - Ne fait que des LECTURES sur Zernio (GET). Aucune mutation côté plateformes
//     ni côté notre base. Pas de PII renvoyée.
//   - Si on voulait vraiment durcir : check `auth.getAuthUserId(ctx)` + role admin.
//     Pour le MVP debug, on accepte l'expo en lecture seule.
//
// Sortie : renvoie un objet sérialisable avec :
//   - Pour chaque post Zernio des N derniers : ID, status, plateformes ciblées,
//     URL publiée par plateforme (si disponible), erreurs par plateforme.
//
// Usage : `npx convex run --prod social:debugInspectZernioPosts '{"limit": 5}'`
// ===================================================================================
// SÉCURITÉ : passé en internalAction suite audit security (Finding #1) — la
// version action exposait le contenu de tous les posts Zernio à un visiteur.
export const debugInspectZernioPosts = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (_ctx, { limit = 5 }) => {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return { error: "ZERNIO_API_KEY non configurée." };
    }

    // 1) Résout le profileId (cohérent avec publishToSocials)
    let profileId: string | null;
    try {
      profileId = await resolveProfileId(apiKey);
    } catch (err) {
      return { error: `resolveProfileId a planté: ${String(err).slice(0, 200)}` };
    }
    if (!profileId) return { error: "Aucun profile Zernio." };

    // 2) GET /v1/posts?profileId=...&limit=...
    //    On affiche le payload complet pour identifier le bon champ d'ID
    //    et les détails par plateforme (URL publiée, statut, erreurs).
    const url = `${ZERNIO_BASE_URL}/posts?profileId=${encodeURIComponent(profileId)}&limit=${limit}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        status: res.status,
        rawTextPreview: text.slice(0, 1000),
        error: "Réponse Zernio non-JSON.",
      };
    }

    return {
      status: res.status,
      profileId,
      // On renvoie l'intégralité brute pour analyse côté CLI — le caller
      // décidera quoi extraire (URL TikTok, status par plateforme, etc.).
      posts: parsed,
    };
  },
});

// ===================================================================================
// DEBUG : action publique pour lister les comptes sociaux connectés.
//
// Utile pour confirmer si TikTok / Instagram sont vraiment connectés côté Zernio,
// et avec quels comptes (handle TikTok, page Facebook, etc.).
//
// Usage : `npx convex run --prod social:debugListConnectedAccounts`
// ===================================================================================
// SÉCURITÉ : passé en internalAction suite audit security (Finding #1) — la
// version action exposait les handles + tokens TTL des comptes sociaux connectés.
export const debugListConnectedAccounts = internalAction({
  args: {},
  handler: async () => {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return { error: "ZERNIO_API_KEY non configurée." };
    }
    let profileId: string | null;
    try {
      profileId = await resolveProfileId(apiKey);
    } catch (err) {
      return { error: `resolveProfileId a planté: ${String(err).slice(0, 200)}` };
    }
    if (!profileId) return { error: "Aucun profile Zernio." };

    const url = `${ZERNIO_BASE_URL}/accounts?profileId=${encodeURIComponent(profileId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { status: res.status, rawTextPreview: text.slice(0, 1000) };
    }
    return { status: res.status, profileId, accounts: parsed };
  },
});
