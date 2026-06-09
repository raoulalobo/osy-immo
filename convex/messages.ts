// convex/messages.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Messagerie interne entre acheteur potentiel et propriétaire d'annonce.
//
//  Pattern :
//   - Une CONVERSATION par couple (property, buyer) — pas de fragmentation.
//   - `startConversation` créé OU retrouve la conversation existante puis poste
//     le premier message — idempotent pour l'UX "cliquer plusieurs fois".
//   - `send` ajoute un message ; met à jour les compteurs de non-lus côté
//     destinataire ET le preview/timestamp de la conversation.
//
//  Sécurité :
//   - Toutes les mutations exigent une session valide.
//   - On vérifie systématiquement que l'utilisateur courant est PARTICIPANT
//     de la conversation (buyerId OU ownerId), sinon → 403.
//   - L'auteur ne peut s'envoyer un message à lui-même (= contacter sa propre
//     annonce) — bloqué dans `startConversation`.
//
//  UX temps-réel : grâce à Convex, `listMine` et `getThread` sont des queries
//   réactives — toute nouvelle insertion message met à jour le front instantanément.
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";

// Cap volontaire de longueur — évite spam + garde le preview lisible.
const MAX_MESSAGE_LENGTH = 2000;
const PREVIEW_LENGTH = 140;

// Helper : tronque proprement un body pour la preview de la conversation
function buildPreview(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > PREVIEW_LENGTH
    ? oneLine.slice(0, PREVIEW_LENGTH - 1) + "…"
    : oneLine;
}

// ---------------------------------------------------------------------------
// startConversation
// Crée/retrouve une conversation entre l'utilisateur courant (buyer) et le
// propriétaire d'une annonce, puis insère le premier message.
//
// Idempotent : si l'utilisateur a déjà une conversation sur cette annonce, on
// ajoute simplement un nouveau message à la conversation existante.
// ---------------------------------------------------------------------------
export const startConversation = mutation({
  args: {
    propertyId: v.id("properties"),
    body: v.string(),
  },
  handler: async (ctx, { propertyId, body }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) throw new Error("Connexion requise.");

    const trimmed = body.trim();
    if (trimmed.length === 0) throw new Error("Le message ne peut pas être vide.");
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Le message dépasse ${MAX_MESSAGE_LENGTH} caractères.`);
    }

    const property = await ctx.db.get(propertyId);
    if (!property) throw new Error("Annonce introuvable.");
    // On bloque le scénario où l'owner se contacte lui-même
    if (property.ownerId === userId) {
      throw new Error("Vous êtes propriétaire de cette annonce.");
    }

    // Conversation existante ? (un seul couple property+buyer autorisé)
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_property_and_buyer", (q) =>
        q.eq("propertyId", propertyId).eq("buyerId", userId)
      )
      .unique();

    const preview = buildPreview(trimmed);
    const now = Date.now();

    let conversationId: Id<"conversations">;
    if (existing) {
      conversationId = existing._id;
      await ctx.db.patch(conversationId, {
        lastMessagePreview: preview,
        lastMessageAt: now,
        // Le destinataire est l'owner — on incrémente son compteur unread
        unreadForOwner: existing.unreadForOwner + 1,
      });
    } else {
      conversationId = await ctx.db.insert("conversations", {
        propertyId,
        buyerId: userId,
        ownerId: property.ownerId,
        lastMessagePreview: preview,
        lastMessageAt: now,
        unreadForOwner: 1,
        unreadForBuyer: 0,
      });
      // Analytics : 1er message d'une NOUVELLE conversation = nouveau lead.
      // On compte le "contact" uniquement ici (branche création), pas quand on
      // ré-engage une conversation existante (sinon le compteur de demandes
      // serait gonflé). Alimente la tuile "Demandes reçues" de /dashboard/stats.
      await ctx.db.insert("events", { propertyId, type: "contact" });
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId,
      fromUserId: userId,
      body: trimmed,
    });

    // Email de notification au destinataire (owner) — fire-and-forget via
    // le scheduler. Le `runAfter(0, …)` insère un job qui s'exécute après
    // commit de la mutation. Skip silencieux si RESEND_API_KEY absent.
    await ctx.scheduler.runAfter(0, internal.emails.notifyNewMessage, {
      conversationId,
      messageId,
      kind: existing ? "new_message" : "new_conversation",
    });

    return conversationId;
  },
});

// ---------------------------------------------------------------------------
// send — ajoute un message dans une conversation existante (réponse).
// L'utilisateur DOIT être participant (buyer OU owner) de la conversation.
// ---------------------------------------------------------------------------
export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
  },
  handler: async (ctx, { conversationId, body }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) throw new Error("Connexion requise.");

    const trimmed = body.trim();
    if (trimmed.length === 0) throw new Error("Le message ne peut pas être vide.");
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Le message dépasse ${MAX_MESSAGE_LENGTH} caractères.`);
    }

    const conversation = await ctx.db.get(conversationId);
    if (!conversation) throw new Error("Conversation introuvable.");

    const isOwner = conversation.ownerId === userId;
    const isBuyer = conversation.buyerId === userId;
    if (!isOwner && !isBuyer) {
      throw new Error("Vous ne participez pas à cette conversation.");
    }

    const preview = buildPreview(trimmed);
    const now = Date.now();

    // Incrémente le compteur unread de l'autre partie uniquement
    await ctx.db.patch(conversationId, {
      lastMessagePreview: preview,
      lastMessageAt: now,
      unreadForOwner: isBuyer
        ? conversation.unreadForOwner + 1
        : conversation.unreadForOwner,
      unreadForBuyer: isOwner
        ? conversation.unreadForBuyer + 1
        : conversation.unreadForBuyer,
    });

    const messageId = await ctx.db.insert("messages", {
      conversationId,
      fromUserId: userId,
      body: trimmed,
    });

    // Email au destinataire (l'autre partie de la conversation).
    // Cooldown 5 min géré côté action — pas besoin de filtrer ici.
    await ctx.scheduler.runAfter(0, internal.emails.notifyNewMessage, {
      conversationId,
      messageId,
      kind: "new_message",
    });
  },
});

// ---------------------------------------------------------------------------
// markRead — remet à 0 le compteur unread de l'utilisateur courant
// + tagge readAt sur les messages reçus dans la conversation.
// ---------------------------------------------------------------------------
export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return;

    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return;

    const isOwner = conversation.ownerId === userId;
    const isBuyer = conversation.buyerId === userId;
    if (!isOwner && !isBuyer) return;

    // Reset le compteur côté lecteur uniquement
    await ctx.db.patch(conversationId, {
      unreadForOwner: isOwner ? 0 : conversation.unreadForOwner,
      unreadForBuyer: isBuyer ? 0 : conversation.unreadForBuyer,
    });

    // Marque les messages reçus comme lus (= venant de l'autre partie sans readAt)
    const now = Date.now();
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .collect();
    for (const m of msgs) {
      if (m.fromUserId !== userId && m.readAt === undefined) {
        await ctx.db.patch(m._id, { readAt: now });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// listMine — toutes les conversations de l'utilisateur (owner OU buyer).
// Enrichi avec les infos d'annonce + nom de l'interlocuteur pour l'affichage.
// ---------------------------------------------------------------------------
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return [];

    // On collecte des deux côtés puis on déduplique par _id
    const asOwner = await ctx.db
      .query("conversations")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    const asBuyer = await ctx.db
      .query("conversations")
      .withIndex("by_buyer", (q) => q.eq("buyerId", userId))
      .collect();

    const byId = new Map<string, Doc<"conversations">>();
    for (const c of [...asOwner, ...asBuyer]) byId.set(c._id, c);

    const conversations = Array.from(byId.values()).sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt
    );

    // Hydratation : pour chaque conversation on charge l'annonce associée
    // (titre + image principale) et on calcule le rôle de l'utilisateur courant.
    return await Promise.all(
      conversations.map(async (c) => {
        const property = await ctx.db.get(c.propertyId);
        const isOwner = c.ownerId === userId;
        return {
          _id: c._id,
          _creationTime: c._creationTime,
          role: isOwner ? ("owner" as const) : ("buyer" as const),
          unread: isOwner ? c.unreadForOwner : c.unreadForBuyer,
          lastMessagePreview: c.lastMessagePreview,
          lastMessageAt: c.lastMessageAt,
          propertyId: c.propertyId,
          propertyTitle: property?.title ?? "Annonce supprimée",
          propertyImage: property?.images?.[0],
          // ID de l'autre partie (pour potentiellement afficher son nom plus tard)
          otherUserId: isOwner ? c.buyerId : c.ownerId,
        };
      })
    );
  },
});

// ---------------------------------------------------------------------------
// getThread — détail d'une conversation : metadata + tous les messages triés.
// L'utilisateur DOIT être participant, sinon null.
// ---------------------------------------------------------------------------
export const getThread = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return null;

    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return null;
    const isOwner = conversation.ownerId === userId;
    const isBuyer = conversation.buyerId === userId;
    if (!isOwner && !isBuyer) return null;

    const property = await ctx.db.get(conversation.propertyId);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .order("asc")
      .collect();

    return {
      conversation,
      property,
      messages,
      role: isOwner ? ("owner" as const) : ("buyer" as const),
      currentUserId: userId,
    };
  },
});

// ---------------------------------------------------------------------------
// totalUnread — compteur global pour le badge Navbar.
// Somme des `unreadFor*` côté du rôle de l'utilisateur courant.
// ---------------------------------------------------------------------------
export const totalUnread = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return 0;

    const asOwner = await ctx.db
      .query("conversations")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    const asBuyer = await ctx.db
      .query("conversations")
      .withIndex("by_buyer", (q) => q.eq("buyerId", userId))
      .collect();

    let total = 0;
    for (const c of asOwner) total += c.unreadForOwner;
    for (const c of asBuyer) total += c.unreadForBuyer;
    return total;
  },
});
