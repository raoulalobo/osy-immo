// convex/events.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Analytics produit du marketplace.
//
// Mutations :
//   - `record({ propertyId, type, utmSource?, refUserId?, sessionHash?, device? })`
//     Insère un événement. Pour les types "view", on dédupliquait par `sessionHash`
//     sur une fenêtre de 30 minutes — évite de compter chaque rafraîchissement.
//
// Queries :
//   - `statsForProperty({ propertyId, days? })` — Vues/jour + breakdown sources/devices
//     pour une annonce. Owner-only.
//   - `statsForOwner({ days? })` — Agrégation par annonce pour toutes les annonces
//     du user courant (utilisé par le tableau dashboard).
//   - `statsForReferrer({ days? })` — Combien de clics ont été générés par les liens
//     partagés par l'utilisateur courant (?ref=).
//
// Conception : on stocke des événements bruts et on agrège à la demande côté query.
//              Pour ≤ quelques milliers d'événements/annonce/mois c'est suffisant.
//              Si le volume explose, on passera à des compteurs incrémentaux
//              avec une table `propertyStats` (deferred = pas Phase 1).
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

// Fenêtre de dédup pour les vues : 30 minutes (en ms).
// Au-delà, un même visiteur recompte — comportement standard analytics.
const VIEW_DEDUP_WINDOW_MS = 30 * 60 * 1000;

// Bornes utilitaires
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Whitelists des buckets de provenance (Finding #1 audit 260601-1159).
//
// Avant ce fix : `events.record` acceptait n'importe quel string en
// `referrerSource` ou `utmSource`. Un attaquant qui appelle directement la
// mutation pouvait polluer les stats (faux buckets) et abuser du storage
// (long strings). React échappe les labels donc pas de XSS, mais nuit aux
// décisions marketing du propriétaire.
//
// Stratégie : drop SILENCIEUX des valeurs hors liste. On ne throw pas pour
// ne pas casser le tracking côté client si on ajoute un bucket plus tard
// sans coordonner front/back — les events restent enregistrés sans cette
// dimension. Stratégie cohérente avec le "fire-and-forget" du tracking.
//
// Pour ajouter un nouveau bucket (ex: linkedin, twitter), il faut le déclarer
// ici ET (pour utm) dans ShareButton/social.ts, ET dans SOURCE_LABELS frontend.
// ---------------------------------------------------------------------------
const VALID_REFERRER_BUCKETS = new Set<string>([
  "direct",
  "internal",
  "google",
  "bing",
  "duckduckgo",
  "qwant",
  "yahoo",
  "ecosia",
  "brave",
  "external",
]);
const VALID_UTM_BUCKETS = new Set<string>([
  "whatsapp",
  "copy",
  "native",
  "facebook",
]);

// ---------------------------------------------------------------------------
// Mutation `record` — public (pas d'auth requise pour les visiteurs anonymes)
// ---------------------------------------------------------------------------
export const record = mutation({
  args: {
    propertyId: v.id("properties"),
    type: v.union(
      v.literal("view"),
      v.literal("share"),
      v.literal("share_click"),
      v.literal("favorite"),
      v.literal("contact"),
    ),
    refUserId: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    // Bucket Referer classifié côté client par classifyReferrer().
    // Cf. src/lib/referrer.ts pour les valeurs possibles.
    referrerSource: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    device: v.optional(v.string()),
    sessionHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Vérif que l'annonce existe (évite d'avoir des events orphelins)
    const property = await ctx.db.get(args.propertyId);
    if (!property) return null;

    // Dédup des "view" par sessionHash sur 30 min — évite de compter chaque F5.
    // On n'applique la dédup que sur "view" : "share", "favorite", "contact" sont
    // des actions explicites qu'on veut compter à chaque fois.
    if (args.type === "view" && args.sessionHash) {
      const cutoff = Date.now() - VIEW_DEDUP_WINDOW_MS;
      const existing = await ctx.db
        .query("events")
        .withIndex("by_property", (q) =>
          q.eq("propertyId", args.propertyId).gte("_creationTime", cutoff)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("type"), "view"),
            q.eq(q.field("sessionHash"), args.sessionHash)
          )
        )
        .first();
      if (existing) return null; // déjà compté récemment
    }

    // Whitelist anti-pollution (Finding #1 audit 260601-1159) — toute valeur
    // hors liste est silencieusement remplacée par undefined. L'event reste
    // enregistré sans cette dimension, ce qui évite de casser le tracking
    // si un client envoie un bucket inconnu.
    const referrerSource =
      args.referrerSource && VALID_REFERRER_BUCKETS.has(args.referrerSource)
        ? args.referrerSource
        : undefined;
    const utmSource =
      args.utmSource && VALID_UTM_BUCKETS.has(args.utmSource)
        ? args.utmSource
        : undefined;

    return await ctx.db.insert("events", {
      ...args,
      referrerSource,
      utmSource,
    });
  },
});

// ---------------------------------------------------------------------------
// Helpers d'agrégation côté serveur — partagés entre les queries
// ---------------------------------------------------------------------------

type EventDoc = {
  _creationTime: number;
  type: string;
  utmSource?: string;
  referrerSource?: string;
  device?: string;
  refUserId?: string;
  country?: string;
  city?: string;
};

/**
 * Aggrège une liste d'événements en un objet de stats compact.
 * - counts.{type}      : nombre par type (view, share, contact, favorite)
 * - sources.{source}   : nombre par utm_source (whatsapp, copy, direct, ...)
 * - devices.{device}   : nombre par type d'appareil
 * - countries.{ISO}    : nombre par pays (code ISO 2 lettres, ex "CM", "FR")
 * - cities.{name}      : nombre par ville (top villes visiteurs)
 * - dailyViews[]       : [{ day: "2026-05-17", count: 3 }, ...] sur la période
 */
function aggregateEvents(events: EventDoc[], days: number) {
  const counts: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const devices: Record<string, number> = {};
  const countries: Record<string, number> = {};
  const cities: Record<string, number> = {};
  const dailyMap: Record<string, number> = {};

  // Pré-rempli les `days` jours avec 0 pour avoir une série continue (sparkline)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    dailyMap[d.toISOString().slice(0, 10)] = 0;
  }

  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === "view") {
      // Priorité sources :
      //   1. `utmSource` posé explicitement par ShareButton (lien partagé taggé)
      //   2. `referrerSource` inféré depuis le HTTP Referer côté client
      //   3. "direct" en fallback (events historiques d'avant Phase 2)
      const bucket = e.utmSource ?? e.referrerSource ?? "direct";
      sources[bucket] = (sources[bucket] ?? 0) + 1;
      if (e.device) devices[e.device] = (devices[e.device] ?? 0) + 1;
      if (e.country) countries[e.country] = (countries[e.country] ?? 0) + 1;
      if (e.city) cities[e.city] = (cities[e.city] ?? 0) + 1;
      const day = new Date(e._creationTime).toISOString().slice(0, 10);
      if (day in dailyMap) dailyMap[day]! += 1;
    }
  }

  const dailyViews = Object.entries(dailyMap).map(([day, count]) => ({
    day,
    count,
  }));

  // IMPORTANT : on renvoie les ventilations sous forme de TABLEAUX [clé, count]
  // et non de maps { clé: count }.
  //
  // Pourquoi ? Convex interdit les caractères non-ASCII dans les NOMS de champs
  // d'un objet retourné (cf. validateObjectField). Or `cities` est du texte
  // libre : une ville comme « Yaoundé » (avec accent) utilisée comme CLÉ d'objet
  // fait planter la sérialisation de toute la query ("invalid character 'é'").
  // En tableau, « Yaoundé » devient une simple VALEUR (parfaitement autorisée).
  //
  // `counts` reste une map : ses clés sont des littéraux ASCII garantis
  // (view/share/share_click/favorite/contact), et le front y accède par nom
  // (ex. counts.view). `sources`/`devices`/`countries` passent aussi en tableaux
  // par cohérence (un même composant BreakdownCard les consomme) et par sécurité
  // (un utmSource/pays exotique pourrait lui aussi contenir du non-ASCII).
  return {
    counts,
    sources: Object.entries(sources),
    devices: Object.entries(devices),
    countries: Object.entries(countries),
    cities: Object.entries(cities),
    dailyViews,
  };
}

// ---------------------------------------------------------------------------
// Query : stats détaillées d'une annonce (Owner-only)
// ---------------------------------------------------------------------------
export const statsForProperty = query({
  args: {
    propertyId: v.id("properties"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { propertyId, days = 7 }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return null;
    const property = await ctx.db.get(propertyId);
    if (!property || property.ownerId !== userId) return null;

    const since = Date.now() - days * DAY_MS;
    const events = await ctx.db
      .query("events")
      .withIndex("by_property", (q) =>
        q.eq("propertyId", propertyId).gte("_creationTime", since)
      )
      .collect();

    return aggregateEvents(events, days);
  },
});

// ---------------------------------------------------------------------------
// Query : stats agrégées pour TOUTES les annonces du user courant
// Utilisée par le tableau dashboard pour afficher les compteurs par ligne.
// ---------------------------------------------------------------------------
export const statsForOwner = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days = 7 }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return {};

    // Récupère toutes les annonces du user puis leurs events sur la période
    const properties = await ctx.db
      .query("properties")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();

    const since = Date.now() - days * DAY_MS;

    // Pour chaque annonce, on récupère ses events filtrés (parallèle).
    // Avec Convex, `Promise.all` exécute en parallèle côté runtime.
    const entries = await Promise.all(
      properties.map(async (p) => {
        const events = await ctx.db
          .query("events")
          .withIndex("by_property", (q) =>
            q.eq("propertyId", p._id).gte("_creationTime", since)
          )
          .collect();
        return [p._id as string, aggregateEvents(events, days)] as const;
      })
    );

    // Map id → stats. Sérialisable JSON (utilisable côté front comme dict).
    return Object.fromEntries(entries);
  },
});

// ---------------------------------------------------------------------------
// Query : combien de clics les liens partagés par l'utilisateur ont généré
// "Ambassadeurs" → voir qui apporte du trafic.
// ---------------------------------------------------------------------------
export const statsForReferrer = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days = 30 }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return null;

    const since = Date.now() - days * DAY_MS;
    const events = await ctx.db
      .query("events")
      .withIndex("by_ref_user", (q) =>
        q.eq("refUserId", userId).gte("_creationTime", since)
      )
      .collect();

    // Décompte par type pour le résumé "X clics, Y contacts générés..."
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return { counts, totalEvents: events.length };
  },
});
