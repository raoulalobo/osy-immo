// convex/favorites.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Gestion des favoris (utilisateur ↔ annonce).
//
// Fonctions :
//  - toggle({ propertyId })    : ajoute/retire un favori pour l'utilisateur courant.
//  - listMine()                : retourne les annonces favorites de l'utilisateur courant.
//  - isFavorite({ propertyId }): booléen indiquant si l'annonce est en favori.
//
// Sécurité : toutes les opérations exigent une session authentifiée.
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

/**
 * Bascule l'état favori de l'annonce pour l'utilisateur courant.
 * Renvoie le nouvel état (true = favori, false = retiré).
 */
export const toggle = mutation({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, { propertyId }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) throw new Error("Connexion requise");

    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_user_and_property", (q) =>
        q.eq("userId", userId).eq("propertyId", propertyId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    }
    await ctx.db.insert("favorites", { userId, propertyId });
    // Analytics : on compte l'AJOUT aux favoris (le retrait ci-dessus n'est PAS
    // compté). Insert direct dans `events` plutôt que via la mutation publique
    // `events.record` — on a déjà accès à ctx.db ici, et la dédup/whitelist de
    // `record` concerne les "view"/utm, pas les favoris. Cf. convex/events.ts.
    // Sans cette ligne, la tuile "Ajouts favoris" de /dashboard/stats restait à 0.
    await ctx.db.insert("events", { propertyId, type: "favorite" });
    return true;
  },
});

/**
 * Liste les annonces favorites de l'utilisateur courant.
 * Joint la table `properties` pour renvoyer un objet enrichi.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return [];

    const favs = await ctx.db
      .query("favorites")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    // Hydratation : on récupère chaque annonce associée
    const items = await Promise.all(
      favs.map(async (f) => {
        const property = await ctx.db.get(f.propertyId);
        return property ? { favoriteId: f._id, property } : null;
      })
    );
    return items.filter(Boolean);
  },
});

/**
 * Indique si une annonce est en favori — utile pour l'UI bouton coeur.
 */
export const isFavorite = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, { propertyId }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return false;
    const row = await ctx.db
      .query("favorites")
      .withIndex("by_user_and_property", (q) =>
        q.eq("userId", userId).eq("propertyId", propertyId)
      )
      .unique();
    return Boolean(row);
  },
});
