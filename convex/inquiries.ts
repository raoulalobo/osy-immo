// convex/inquiries.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Demandes de contact pour une annonce. Permet à un visiteur (connecté ou non)
//        d'envoyer un message au propriétaire.
//
// Fonctions :
//  - send({ ... })        : public — envoie une demande.
//  - listForOwner()       : protégé — toutes les demandes reçues par l'utilisateur courant.
//  - markRead({ id })     : protégé — propriétaire-only.
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

// Limites de longueur côté serveur (Finding #4 audit 260531) — défense en
// profondeur même si l'UI cap déjà chaque champ. Empêche un attaquant CLI
// d'envoyer 1 MB de payload texte par inquiry pour saturer le storage.
const INQUIRY_NAME_MAX = 100;
const INQUIRY_EMAIL_MAX = 254;     // RFC 5321 SMTP recipient limit
const INQUIRY_PHONE_MAX = 30;
const INQUIRY_MESSAGE_MAX = 5000;
// Regex email volontairement permissif (autorise les domaines locaux/intl) mais
// rejette les chaînes manifestement non-email (espaces, multi-@, manque de TLD).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Cooldown anti-spam : 1 inquiry par couple (propertyId, fromEmail) / 5 minutes.
// Volontairement basé sur fromEmail plutôt que sessionHash (qu'on n'a pas ici).
// Un attaquant peut faire varier fromEmail pour bypass — c'est traité par le
// rate limit naturel Convex (~60 req/s) et resterait du spam visible côté UI.
const INQUIRY_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Envoie une demande de contact. Visiteur anonyme OU authentifié.
 *
 * Garde-fous (Finding #4 + #7 audit 260531) :
 *   - Annonce doit exister + être active (déjà en place).
 *   - Validation regex sur fromEmail (bloque les valeurs manifestement non-email).
 *   - Cap de longueur sur chaque champ texte.
 *   - Cooldown 5 min par couple (propertyId, fromEmail) pour limiter le spam DB.
 */
export const send = mutation({
  args: {
    propertyId: v.id("properties"),
    fromName: v.string(),
    fromEmail: v.string(),
    fromPhone: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    // 1) Validation des longueurs (défense en profondeur — UI le fait déjà)
    if (args.fromName.length === 0 || args.fromName.length > INQUIRY_NAME_MAX) {
      throw new Error(`Le nom doit faire 1 à ${INQUIRY_NAME_MAX} caractères.`);
    }
    if (args.fromEmail.length === 0 || args.fromEmail.length > INQUIRY_EMAIL_MAX) {
      throw new Error("Email invalide.");
    }
    if (!EMAIL_RE.test(args.fromEmail)) {
      throw new Error("Email invalide.");
    }
    if (args.fromPhone && args.fromPhone.length > INQUIRY_PHONE_MAX) {
      throw new Error("Numéro de téléphone trop long.");
    }
    if (args.message.length === 0 || args.message.length > INQUIRY_MESSAGE_MAX) {
      throw new Error(
        `Le message doit faire 1 à ${INQUIRY_MESSAGE_MAX} caractères.`
      );
    }

    // 2) Annonce existe + active ?
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Annonce introuvable.");
    if (property.status !== "active")
      throw new Error("Cette annonce n'est pas active.");

    // 3) Cooldown anti-spam : refuse les inquiries identiques (mêmes propertyId
    //    + fromEmail) dans la fenêtre des 5 dernières minutes.
    const since = Date.now() - INQUIRY_COOLDOWN_MS;
    const recent = await ctx.db
      .query("inquiries")
      .withIndex("by_property", (q) =>
        q.eq("propertyId", args.propertyId).gte("_creationTime", since)
      )
      .filter((q) => q.eq(q.field("fromEmail"), args.fromEmail.toLowerCase()))
      .first();
    if (recent) {
      throw new Error(
        "Vous avez déjà contacté ce propriétaire récemment — patientez quelques minutes."
      );
    }

    // 4) Insert. On stocke l'email en lowercase pour cohérence avec le cooldown
    //    (recherche par fromEmail).
    const userId = await auth.getAuthUserId(ctx);
    const inquiryId = await ctx.db.insert("inquiries", {
      ...args,
      fromEmail: args.fromEmail.toLowerCase(),
      fromUserId: userId ?? undefined,
      status: "new",
    });
    // Analytics : une demande de contact a été envoyée sur cette annonce.
    // Insert direct dans `events` (on a ctx.db) — alimente la tuile
    // "Demandes reçues" de /dashboard/stats, qui restait à 0 sans ça.
    await ctx.db.insert("events", {
      propertyId: args.propertyId,
      type: "contact",
    });
    return inquiryId;
  },
});

/**
 * Demandes reçues par l'utilisateur courant (sur ses propres annonces).
 */
export const listForOwner = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return [];

    // Toutes mes annonces
    const myProps = await ctx.db
      .query("properties")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    const propIds = new Set(myProps.map((p) => p._id));

    // Pour chacune, on récupère les demandes
    const all = await Promise.all(
      myProps.map((p) =>
        ctx.db
          .query("inquiries")
          .withIndex("by_property", (q) => q.eq("propertyId", p._id))
          .collect()
      )
    );
    return all
      .flat()
      .filter((i) => propIds.has(i.propertyId))
      .sort((a, b) => b._creationTime - a._creationTime);
  },
});

/**
 * Marque une demande comme lue. Seul le propriétaire de l'annonce peut le faire.
 */
export const markRead = mutation({
  args: { id: v.id("inquiries") },
  handler: async (ctx, { id }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) throw new Error("Connexion requise");

    const inquiry = await ctx.db.get(id);
    if (!inquiry) return;
    const property = await ctx.db.get(inquiry.propertyId);
    if (!property || property.ownerId !== userId)
      throw new Error("Action non autorisée.");

    await ctx.db.patch(id, { status: "read" });
  },
});
