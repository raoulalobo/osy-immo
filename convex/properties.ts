// convex/properties.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Queries + Mutations Convex pour les annonces immobilières.
//
// Fonctions exposées :
//  - list({ filters?, limit? })          : liste bornée / filtrée des annonces ACTIVE
//                                          (usages simples, ex. home « annonces récentes »).
//  - listPaginated({ paginationOpts, filters? }) : listing /properties avec pagination
//                                          par curseur (bouton « Charger plus »).
//  - search({ q, paginationOpts, filters? }) : recherche full-text paginée via le searchIndex.
//  - get({ id })                : détail d'une annonce.
//  - listByOwner({ ownerId })   : annonces d'un utilisateur (dashboard).
//  - create / update / remove   : CRUD propriétaire-only (authentification requise).
//
// Sécurité : les mutations vérifient `auth.getUserId(ctx)` (helper BetterAuth)
//            et que `ownerId === userId` pour update/remove.
//
// Exemple : `convex.query(api.properties.list, { listingType: "sale", city: "Lyon" })`
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Récupère l'utilisateur authentifié ou jette une erreur.
 * Utilisé par toutes les mutations protégées.
 */
async function requireUserId(ctx: { auth: any } & any): Promise<string> {
  const userId = await auth.getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Vous devez être connecté pour effectuer cette action.");
  }
  return userId;
}

// Cap maximum sur le paramètre `limit` exposé par les queries publiques
// (Finding #2 audit 260601-1159). Empêche un attaquant d'envoyer
// `limit: 100000` et de saturer le backend Convex / le coût bandwith.
// 100 est suffisant pour toutes les pages UI raisonnables (grille 3 colonnes
// avec ~33 lignes max scrollables avant pagination explicite).
const MAX_LIST_LIMIT = 100;

// ---------------------------------------------------------------------------
// Short-slug helper — génère un slug 6 chars sur alphabet réduit (sans
// caractères ambigus 0/O/I/l/1) utilisé pour construire des URLs courtes
// `osy-immo.com/p/<slug>` (cf. route src/routes/p.$slug.tsx).
//
// Pourquoi un alphabet réduit : maximise la lisibilité quand l'utilisateur
// doit taper l'URL à la main (depuis TikTok par exemple).
// Pourquoi 6 chars : 31^6 ≈ 887 millions de combinaisons → probabilité de
// collision négligeable même sur des dizaines de milliers d'annonces.
// ---------------------------------------------------------------------------
const SHORT_SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 31 chars
const SHORT_SLUG_LENGTH = 6;

function generateShortSlug(): string {
  let s = "";
  for (let i = 0; i < SHORT_SLUG_LENGTH; i++) {
    s += SHORT_SLUG_ALPHABET[
      Math.floor(Math.random() * SHORT_SLUG_ALPHABET.length)
    ];
  }
  return s;
}

/**
 * Génère un shortSlug unique en cherchant dans la table properties via l'index.
 * Retry jusqu'à 5 fois en cas de collision improbable. Throw si on n'arrive
 * pas à en trouver un (signal d'un alphabet/longueur sous-dimensionné).
 *
 * @param ctx — ctx Convex avec accès db.query
 */
async function generateUniqueShortSlug(ctx: { db: any }): Promise<string> {
  for (let attempts = 0; attempts < 5; attempts++) {
    const slug = generateShortSlug();
    const existing = await ctx.db
      .query("properties")
      .withIndex("by_short_slug", (q: any) => q.eq("shortSlug", slug))
      .first();
    if (!existing) return slug;
  }
  throw new Error(
    "Impossible de générer un short-slug unique après 5 tentatives — augmenter SHORT_SLUG_LENGTH."
  );
}

// ---------------------------------------------------------------------------
// QUERIES
// ---------------------------------------------------------------------------

/**
 * Liste les annonces actives, optionnellement filtrées.
 * Tri : `publishedAt` desc (les plus récentes en tête).
 */
export const list = query({
  args: {
    listingType: v.optional(v.union(v.literal("sale"), v.literal("rent"))),
    type: v.optional(
      v.union(
        v.literal("apartment"),
        v.literal("house"),
        v.literal("land"),
        v.literal("commercial")
      )
    ),
    city: v.optional(v.string()),
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    minSurface: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Choix de l'index le plus sélectif disponible
    let candidates;
    if (args.city) {
      candidates = await ctx.db
        .query("properties")
        .withIndex("by_city", (q) =>
          q.eq("city", args.city!).eq("status", "active")
        )
        .collect();
    } else if (args.listingType) {
      candidates = await ctx.db
        .query("properties")
        .withIndex("by_listingType_status", (q) =>
          q.eq("listingType", args.listingType!).eq("status", "active")
        )
        .collect();
    } else {
      candidates = await ctx.db
        .query("properties")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect();
    }

    // Filtres complémentaires en mémoire (le dataset attendu reste raisonnable)
    const filtered = candidates.filter((p) => {
      if (args.type && p.type !== args.type) return false;
      if (
        args.listingType &&
        args.city && // si city utilisé, on n'a pas filtré par listingType
        p.listingType !== args.listingType
      )
        return false;
      if (args.minPrice !== undefined && p.price < args.minPrice) return false;
      if (args.maxPrice !== undefined && p.price > args.maxPrice) return false;
      if (args.minSurface !== undefined && p.surface < args.minSurface)
        return false;
      return true;
    });

    // Tri décroissant par publishedAt (fallback _creationTime)
    filtered.sort(
      (a, b) =>
        (b.publishedAt ?? b._creationTime) -
        (a.publishedAt ?? a._creationTime)
    );

    // Cap MAX_LIST_LIMIT pour empêcher un attaquant de demander 100k résultats
    return filtered.slice(0, Math.min(args.limit ?? 50, MAX_LIST_LIMIT));
  },
});

/**
 * Liste paginée par curseur des annonces actives — utilisée par la page
 * /properties avec son bouton « Charger plus » (via `usePaginatedQuery`).
 *
 * Différences avec `list` (conservée pour les usages bornés type home) :
 *   - Pagination par curseur Convex (`.paginate()`) au lieu d'un `.collect()`
 *     + slice : le coût de lecture est proportionnel à la page, pas à la table.
 *   - L'ordre vient de l'index (`publishedAt` en dernier champ, cf. schema.ts)
 *     avec `.order("desc")` → plus récemment publiées d'abord, identique au
 *     tri mémoire de `list`.
 *
 * Filtres :
 *   - city / listingType / status : appliqués via l'index le plus sélectif
 *     (même cascade que `list`).
 *   - type / minPrice / maxPrice / minSurface (+ listingType quand city est
 *     aussi fourni) : appliqués EN MÉMOIRE sur la page retournée. Conséquence
 *     assumée : une page peut contenir moins de `numItems` éléments (voire 0)
 *     tout en ayant `isDone === false` — `usePaginatedQuery` gère ce cas, le
 *     `continueCursor` reste valide et le clic suivant continue le parcours.
 *
 * Exemple : `usePaginatedQuery(api.properties.listPaginated, { city: "Lyon" },
 *           { initialNumItems: 12 })`
 */
export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    listingType: v.optional(v.union(v.literal("sale"), v.literal("rent"))),
    type: v.optional(
      v.union(
        v.literal("apartment"),
        v.literal("house"),
        v.literal("land"),
        v.literal("commercial")
      )
    ),
    city: v.optional(v.string()),
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    minSurface: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Cap défensif sur numItems (parité avec MAX_LIST_LIMIT, audit 260601-1159) :
    // empêche un client malveillant de demander 100k documents d'un coup.
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, MAX_LIST_LIMIT),
    };

    // Choix de l'index le plus sélectif disponible (même cascade que `list`).
    // `.order("desc")` trie par le dernier champ de l'index = publishedAt desc.
    let result;
    if (args.city) {
      result = await ctx.db
        .query("properties")
        .withIndex("by_city", (q) =>
          q.eq("city", args.city!).eq("status", "active")
        )
        .order("desc")
        .paginate(paginationOpts);
    } else if (args.listingType) {
      result = await ctx.db
        .query("properties")
        .withIndex("by_listingType_status", (q) =>
          q.eq("listingType", args.listingType!).eq("status", "active")
        )
        .order("desc")
        .paginate(paginationOpts);
    } else {
      result = await ctx.db
        .query("properties")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .order("desc")
        .paginate(paginationOpts);
    }

    // Filtres complémentaires appliqués sur la page retournée (même prédicat
    // que `list`) — voir le commentaire de tête pour les pages courtes.
    const page = result.page.filter((p) => {
      if (args.type && p.type !== args.type) return false;
      if (
        args.listingType &&
        args.city && // si city utilisé, l'index n'a pas filtré par listingType
        p.listingType !== args.listingType
      )
        return false;
      if (args.minPrice !== undefined && p.price < args.minPrice) return false;
      if (args.maxPrice !== undefined && p.price > args.maxPrice) return false;
      if (args.minSurface !== undefined && p.surface < args.minSurface)
        return false;
      return true;
    });

    // Spread pour préserver isDone / continueCursor (et les champs internes
    // type splitCursor / pageStatus que Convex peut renvoyer).
    return { ...result, page };
  },
});

/**
 * Recherche full-text paginée sur le titre, avec filtres optionnels par champ
 * indexé. Consommée par /properties via `usePaginatedQuery` (bouton « Charger
 * plus »). L'ordre est la pertinence full-text (les search indexes
 * n'acceptent pas `.order()`).
 */
export const search = query({
  args: {
    q: v.string(),
    city: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("apartment"),
        v.literal("house"),
        v.literal("land"),
        v.literal("commercial")
      )
    ),
    listingType: v.optional(v.union(v.literal("sale"), v.literal("rent"))),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Cap défensif sur numItems — même garde-fou que listPaginated.
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, MAX_LIST_LIMIT),
    };

    return await ctx.db
      .query("properties")
      .withSearchIndex("search_title", (q) => {
        let s = q.search("title", args.q).eq("status", "active");
        if (args.city) s = s.eq("city", args.city);
        if (args.type) s = s.eq("type", args.type);
        if (args.listingType) s = s.eq("listingType", args.listingType);
        return s;
      })
      .paginate(paginationOpts);
  },
});

/**
 * Détail d'une annonce.
 *
 * Règle d'accès affinée (post audit Finding #2 + raffinement UX) :
 *   - Statuts "publiquement visibles" → accès libre (visiteurs + connectés) :
 *       active, sold, rented, archived
 *   - draft → owner-only (jamais publié, son existence ne doit pas être révélée)
 *
 * Pourquoi sold/rented/archived sont publics : ces annonces ont été ACTIVE à
 * un moment, leur PII (adresse, lat/lng) circulait déjà sur les réseaux et
 * les caches Open Graph. Les masquer rétroactivement crée une 404 trompeuse
 * pour les utilisateurs qui cliquent sur un lien WhatsApp partagé hier.
 * La page détail elle-même affiche un bandeau "Vendue / Louée / Retirée" +
 * désactive les actions de contact (cf. properties.$id.tsx).
 *
 * Pourquoi draft reste owner-only : c'est le cas critique du Finding #2 audit.
 * Une annonce draft = brouillon non-publié, l'auteur n'a jamais consenti à
 * exposer ses coordonnées GPS / adresse. Doit rester strictement privé.
 */
const PUBLICLY_VISIBLE_STATUSES: readonly string[] = [
  "active",
  "sold",
  "rented",
  "archived",
];

export const get = query({
  args: { id: v.id("properties") },
  handler: async (ctx, { id }) => {
    const property = await ctx.db.get(id);
    if (!property) return null;
    if (PUBLICLY_VISIBLE_STATUSES.includes(property.status)) return property;
    // draft → owner-only
    const userId = await auth.getAuthUserId(ctx);
    if (!userId || property.ownerId !== userId) return null;
    return property;
  },
});

/**
 * Annonces similaires à une propriété donnée — affichées en bas de la page
 * détail quand l'annonce courante est sold / rented / archived.
 *
 * Stratégie de matching, du plus précis au plus large :
 *   1. Même `city` + même `listingType` + `status: "active"` (et ≠ propertyId courant)
 *   2. Si moins de `limit` résultats : élargir à même `listingType` toute ville
 *
 * Tri : par récence de publication (`order("desc")` via index by_listingType_status
 * qui inclut _creationTime).
 *
 * Public : aucun guard auth — ces données sont déjà publiques via `properties.list`.
 */
export const listSimilar = query({
  args: {
    propertyId: v.id("properties"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { propertyId, limit = 4 }) => {
    // Cap dès l'entrée : MAX_LIST_LIMIT / 2 car on multiplie ensuite par 2
    // pour le coussin de dédup (cf. .take(limit * 2) plus bas).
    // Au final, on ne récupère jamais plus de MAX_LIST_LIMIT documents.
    limit = Math.min(limit, MAX_LIST_LIMIT / 2);
    const ref = await ctx.db.get(propertyId);
    if (!ref) return [];

    // Priorité 1 — même ville + même type de transaction
    const sameCity = await ctx.db
      .query("properties")
      .withIndex("by_city", (q) =>
        q.eq("city", ref.city).eq("status", "active")
      )
      .collect();
    const filtered = sameCity.filter(
      (p) => p._id !== ref._id && p.listingType === ref.listingType
    );
    if (filtered.length >= limit) return filtered.slice(0, limit);

    // Priorité 2 — élargit à même listingType (toutes villes), 2× limit pour
    // avoir un coussin après dédup avec les résultats déjà sélectionnés.
    const more = await ctx.db
      .query("properties")
      .withIndex("by_listingType_status", (q) =>
        q.eq("listingType", ref.listingType).eq("status", "active")
      )
      .order("desc")
      .take(limit * 2);
    const seen = new Set(filtered.map((p) => p._id));
    for (const p of more) {
      if (filtered.length >= limit) break;
      if (p._id === ref._id || seen.has(p._id)) continue;
      filtered.push(p);
      seen.add(p._id);
    }
    return filtered.slice(0, limit);
  },
});

/**
 * Annonces du propriétaire courant — utilisé par le dashboard `/dashboard`.
 *
 * Sécurité (Finding #2 audit 260531) :
 *   Le paramètre `ownerId` arbitraire a été RETIRÉ. Avant le fix, n'importe qui
 *   pouvait lister toutes les annonces d'un user (incluant drafts/sold/archived
 *   et leurs PII) en devinant ou récupérant son ownerId depuis `properties.list`.
 *
 *   Désormais on lit STRICTEMENT le user authentifié — pas de prise d'argument.
 */
export const listByOwner = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("properties")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();
  },
});

// ---------------------------------------------------------------------------
// MUTATIONS
// ---------------------------------------------------------------------------

const baseFields = {
  title: v.string(),
  description: v.string(),
  type: v.union(
    v.literal("apartment"),
    v.literal("house"),
    v.literal("land"),
    v.literal("commercial")
  ),
  listingType: v.union(v.literal("sale"), v.literal("rent")),
  price: v.number(),
  surface: v.number(),
  rooms: v.optional(v.number()),
  bedrooms: v.optional(v.number()),
  bathrooms: v.optional(v.number()),
  yearBuilt: v.optional(v.number()),
  energyClass: v.optional(v.string()),
  address: v.string(),
  city: v.string(),
  postalCode: v.optional(v.string()),
  region: v.optional(v.string()),
  country: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  images: v.array(v.string()),
  videos: v.optional(v.array(v.string())),
  features: v.array(v.string()),
  // Choix du média publié sur les réseaux sociaux (Facebook + Instagram + TikTok).
  // Optionnel côté input : si absent à la création, on tombe sur "images" par
  // défaut (cf. preparePost dans convex/social.ts).
  socialMediaChoice: v.optional(
    v.union(v.literal("images"), v.literal("video"))
  ),
};

// Limites de longueur (Finding #6 audit 260531) — défense en profondeur côté
// serveur même si l'UI affiche déjà un compteur visuel à 400 caractères.
// Sans ces caps, un user authentifié peut créer 100 annonces × 1 MB de
// description et saturer le storage Convex du projet.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;        // bien au-delà des 400 chars envoyés aux réseaux
const ADDRESS_MAX = 500;
const CITY_MAX = 100;
const FEATURES_MAX_LEN = 20;         // nombre d'éléments dans le tableau features
const FEATURE_ITEM_MAX = 50;
const IMAGES_MAX_LEN = 10;
const VIDEOS_MAX_LEN = 5;
const URL_ITEM_MAX = 1000;

/**
 * Valide les longueurs des champs texte d'une annonce. Lève si dépassement.
 * Appelé par create + update pour garantir des bornes serveur.
 */
function validateTextLengths(args: {
  title?: string;
  description?: string;
  address?: string;
  city?: string;
  features?: string[];
  images?: string[];
  videos?: string[];
}) {
  if (args.title !== undefined && args.title.length > TITLE_MAX) {
    throw new Error(`Titre trop long (max ${TITLE_MAX} caractères).`);
  }
  if (args.description !== undefined && args.description.length > DESCRIPTION_MAX) {
    throw new Error(`Description trop longue (max ${DESCRIPTION_MAX} caractères).`);
  }
  if (args.address !== undefined && args.address.length > ADDRESS_MAX) {
    throw new Error(`Adresse trop longue (max ${ADDRESS_MAX} caractères).`);
  }
  if (args.city !== undefined && args.city.length > CITY_MAX) {
    throw new Error(`Ville trop longue (max ${CITY_MAX} caractères).`);
  }
  if (args.features !== undefined) {
    if (args.features.length > FEATURES_MAX_LEN) {
      throw new Error(`Trop d'équipements (max ${FEATURES_MAX_LEN}).`);
    }
    for (const f of args.features) {
      if (f.length > FEATURE_ITEM_MAX) {
        throw new Error(`Équipement trop long (max ${FEATURE_ITEM_MAX} caractères).`);
      }
    }
  }
  if (args.images !== undefined) {
    if (args.images.length > IMAGES_MAX_LEN) {
      throw new Error(`Trop d'images (max ${IMAGES_MAX_LEN}).`);
    }
    for (const u of args.images) {
      if (u.length > URL_ITEM_MAX) throw new Error("URL image trop longue.");
    }
  }
  if (args.videos !== undefined) {
    if (args.videos.length > VIDEOS_MAX_LEN) {
      throw new Error(`Trop de vidéos (max ${VIDEOS_MAX_LEN}).`);
    }
    for (const u of args.videos) {
      if (u.length > URL_ITEM_MAX) throw new Error("URL vidéo trop longue.");
    }
  }
}

/**
 * Crée une annonce. Par défaut `status = "draft"`.
 */
export const create = mutation({
  args: baseFields,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    // Validation longueurs côté serveur (Finding #6 audit 260531)
    validateTextLengths(args);
    // Génère un short-slug unique pour les URLs courtes TikTok (`osy-immo.com/p/<slug>`)
    const shortSlug = await generateUniqueShortSlug(ctx);
    const id = await ctx.db.insert("properties", {
      ownerId: userId,
      status: "draft",
      shortSlug,
      ...args,
    });
    // Hook image Open Graph : génère le dérivé 1200×630 dès qu'il y a une image,
    // pour que l'aperçu de partage soit prêt avant la première publication.
    // Non bloquant (runAfter 0) + no-op si l'action échoue (cf. convex/ogImage.ts).
    if (args.images?.length) {
      await ctx.scheduler.runAfter(0, internal.ogImage.generateOgImage, {
        propertyId: id,
      });
    }
    return id;
  },
});

/**
 * Résout un short-slug en propertyId — utilisé par la route `/p/$slug`
 * qui redirige vers `/properties/$id`. Public, pas d'auth requise (les
 * short-URLs sont conçues pour le partage social).
 *
 * Retourne `null` si le slug n'existe pas (mauvais lien, ou annonce supprimée).
 * On expose juste `propertyId` + `status` — la fiche `/properties/$id` re-vérifie
 * les autorisations (draft → 404 pour les non-owner, cf. properties.get).
 */
export const getByShortSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const property = await ctx.db
      .query("properties")
      .withIndex("by_short_slug", (q) => q.eq("shortSlug", slug))
      .first();
    if (!property) return null;
    // On expose le DOCUMENT COMPLET uniquement si l'annonce est publiquement
    // visible — la route /p/<slug> s'en sert pour générer ses balises Open Graph
    // (aperçu de partage) sans que le crawler ait à suivre la redirection JS.
    // Pour un brouillon (draft), on ne renvoie que de quoi rediriger : pas de
    // fuite des données du bien à un visiteur non-owner.
    const publiclyVisible = PUBLICLY_VISIBLE_STATUSES.includes(property.status);
    return {
      propertyId: property._id,
      status: property.status,
      property: publiclyVisible ? property : null,
    };
  },
});

/**
 * One-shot internal mutation — backfill les short-slugs sur les annonces
 * créées avant l'introduction du champ `shortSlug` dans le schema.
 *
 * À lancer une fois via `npx convex run --prod properties:backfillShortSlugs`.
 * Idempotent : ne touche que les annonces qui n'ont pas encore de slug.
 *
 * Retour : { updated: N } pour audit côté terminal.
 */
export const backfillShortSlugs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("properties").collect();
    let updated = 0;
    for (const p of all) {
      if (p.shortSlug) continue;
      const slug = await generateUniqueShortSlug(ctx);
      await ctx.db.patch(p._id, { shortSlug: slug });
      updated++;
    }
    return { updated, total: all.length };
  },
});

/**
 * Met à jour une annonce (propriétaire seulement).
 */
export const update = mutation({
  args: {
    id: v.id("properties"),
    patch: v.object({
      ...Object.fromEntries(
        Object.entries(baseFields).map(([k, val]) => [k, v.optional(val as any)])
      ),
      status: v.optional(
        v.union(
          v.literal("draft"),
          v.literal("active"),
          v.literal("sold"),
          v.literal("rented"),
          v.literal("archived")
        )
      ),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Annonce introuvable.");
    if (existing.ownerId !== userId)
      throw new Error("Vous n'êtes pas propriétaire de cette annonce.");

    // Validation longueurs sur les champs présents dans le patch
    // (Finding #6 audit 260531). Cast nécessaire car le type inféré de
    // `patch` est restreint à `{status?}` (cf. note dans update.args sur
    // Object.fromEntries qui efface l'inférence côté Convex).
    validateTextLengths(patch as any);

    // Détection de la PREMIÈRE activation (draft / sold / rented / archived → active).
    // Sert à la fois pour l'horodatage `publishedAt` et le hook social Zernio.
    // Note : si l'annonce repasse plus tard active → draft → active, ce flag sera
    // RE-vrai. Mais le hook social a son propre verrou d'idempotence côté base
    // (table socialPosts indexée par propertyId), donc on ne re-postera jamais.
    const isFirstPublication =
      patch.status === "active" && existing.status !== "active";

    const next: any = { ...patch };
    if (isFirstPublication) next.publishedAt = Date.now();
    await ctx.db.patch(id, next);

    // Hook réseaux sociaux : publication automatique sur Facebook + Instagram
    // via Zernio (carrousel multi-images + caption FR + lien).
    //
    //  - `scheduler.runAfter(0, ...)` est non bloquant : l'UI reçoit la confirmation
    //    de la mutation immédiatement, le post part en background.
    //  - L'action vérifie l'idempotence en base et fait un no-op silencieux si
    //    les env vars Zernio ne sont pas configurées (déploiement progressif OK).
    //  - Voir convex/social.ts pour les détails.
    if (isFirstPublication) {
      await ctx.scheduler.runAfter(0, internal.social.publishToSocials, {
        propertyId: id,
      });
    }

    // Hook image Open Graph : régénère le dérivé d'aperçu quand la liste d'images
    // change (la photo principale `images[0]` a pu être remplacée) OU à la
    // première publication (sécurité si le dérivé n'a pas été créé au `create`).
    // Idempotent : `generateOgImage` remplace l'ancien dérivé et le supprime du
    // storage (cf. setOgImage). Non bloquant + no-op silencieux en cas d'échec.
    // Cast `as any` : l'inférence de `patch` est réduite à `{ status? }` ici (cf.
    // note sur Object.fromEntries dans update.args qui efface l'inférence Convex).
    if ((patch as any).images !== undefined || isFirstPublication) {
      await ctx.scheduler.runAfter(0, internal.ogImage.generateOgImage, {
        propertyId: id,
      });
    }

    // Hook notification favoris : quand le bien devient INDISPONIBLE (vendu ou
    // loué), on prévient par email tous les utilisateurs qui l'avaient en favori.
    //
    //  - Déclenché uniquement sur une TRANSITION entrante vers ce statut
    //    (`existing.status !== patch.status`) : éviter de re-notifier si le
    //    propriétaire re-sauvegarde une annonce déjà vendue/louée.
    //  - L'idempotence PAR DESTINATAIRE est garantie côté action via la table
    //    `favoriteStatusNotifications` (cf. convex/emails.ts) — même si cette
    //    transition se reproduit (sold → active → sold), chaque favori ne
    //    reçoit qu'un seul email par statut.
    //  - Non bloquant (`runAfter(0, ...)`) et no-op silencieux si la clé
    //    Resend n'est pas configurée.
    // On capture la valeur narrowée dans une const ("sold" | "rented" | null)
    // plutôt qu'un simple booléen : TypeScript ne propage pas le narrowing de
    // `patch.status` à travers une variable booléenne intermédiaire.
    const unavailableStatus =
      patch.status === "sold" || patch.status === "rented"
        ? patch.status
        : null;
    if (unavailableStatus && existing.status !== unavailableStatus) {
      await ctx.scheduler.runAfter(
        0,
        internal.emails.notifyFavoritesStatusChange,
        { propertyId: id, status: unavailableStatus }
      );
    }
  },
});

/**
 * internalMutation : enregistre le dérivé Open Graph sur une annonce.
 *
 * Appelée par l'action `internal.ogImage.generateOgImage` (qui, étant une action
 * Node, n'a pas accès direct à `ctx.db`). On y centralise aussi le nettoyage du
 * storage : si l'annonce avait déjà un `ogImageId` différent (régénération après
 * changement de photo principale), on supprime l'ancien fichier pour ne pas
 * laisser de dérivés orphelins dans Convex storage.
 */
export const setOgImage = internalMutation({
  args: {
    propertyId: v.id("properties"),
    ogImage: v.string(),
    ogImageId: v.id("_storage"),
  },
  handler: async (ctx, { propertyId, ogImage, ogImageId }) => {
    const existing = await ctx.db.get(propertyId);
    if (!existing) return; // annonce supprimée entre-temps → rien à patcher
    // Supprime l'ancien dérivé s'il existait et qu'il diffère du nouveau.
    if (existing.ogImageId && existing.ogImageId !== ogImageId) {
      await ctx.storage.delete(existing.ogImageId);
    }
    await ctx.db.patch(propertyId, { ogImage, ogImageId });
  },
});

/**
 * internalQuery : liste légère des annonces pour le backfill OG — uniquement les
 * champs nécessaires (id + images + ogImage) pour décider lesquelles régénérer.
 * Utilisée par `internal.ogImage.backfillOgImages`.
 */
export const listForOgBackfill = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("properties").collect();
    return all.map((p) => ({
      _id: p._id,
      hasImage: (p.images?.length ?? 0) > 0,
      hasOgImage: Boolean(p.ogImage),
    }));
  },
});

/**
 * Supprime une annonce (propriétaire seulement).
 */
export const remove = mutation({
  args: { id: v.id("properties") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) return;
    if (existing.ownerId !== userId)
      throw new Error("Vous n'êtes pas propriétaire de cette annonce.");

    // Cascade : supprimer favoris et inquiries liés
    const favs = await ctx.db
      .query("favorites")
      .withIndex("by_property", (q) => q.eq("propertyId", id))
      .collect();
    for (const f of favs) await ctx.db.delete(f._id);

    const inqs = await ctx.db
      .query("inquiries")
      .withIndex("by_property", (q) => q.eq("propertyId", id))
      .collect();
    for (const i of inqs) await ctx.db.delete(i._id);

    // Nettoie le dérivé OG stocké pour cette annonce (évite un fichier orphelin
    // dans Convex storage). Les photos d'origine (images[]) ne sont pas gérées
    // ici : elles peuvent être uploadées sur un storage externe et le flux
    // d'upload historique ne traçait pas leurs storageIds.
    if (existing.ogImageId) await ctx.storage.delete(existing.ogImageId);

    await ctx.db.delete(id);
  },
});
