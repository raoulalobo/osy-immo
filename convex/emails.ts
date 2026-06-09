// convex/emails.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Envoi des emails transactionnels (notifications messagerie) via Resend.
//
//  Architecture :
//   - Les `mutation` Convex ne peuvent pas faire d'appel HTTP externe — c'est par
//     design (les mutations sont déterministes et transactionnelles).
//   - On utilise donc des `internal.action` qui peuvent faire `fetch()`.
//   - Le déclenchement se fait via `ctx.scheduler.runAfter(0, internal.emails.X, …)`
//     depuis la mutation `messages.startConversation` / `messages.send`. Le message
//     est inséré en base SYNCHRONEMENT, l'email part en arrière-plan.
//
//  Fallback no-op :
//   - Si `RESEND_API_KEY` n'est pas défini en env Convex, on log et on skip.
//   - Permet de déployer le code AVANT d'avoir la clé Resend. Les emails se
//     déclencheront automatiquement dès que la clé sera ajoutée.
//
//  Anti-spam :
//   - Cooldown de 5 minutes par destinataire-par-conversation : si un email a
//     été envoyé récemment, le suivant est skipé pour éviter d'inonder l'inbox.
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent } from "./auth";
import {
  renderNewMessageEmail,
  renderNewConversationEmail,
} from "./emailTemplates";
// Helper partagé avec convex/social.ts — voir convex/lib/images.ts pour la logique.
import { proxifyImageUrl } from "./lib/images";

// URL publique du frontend — pour construire les liens vers /dashboard/messages.
// Convex env var (différente de SITE_URL utilisée par BetterAuth qui peut être
// identique). On retombe sur SITE_URL si APP_URL n'est pas défini.
const APP_URL =
  process.env.APP_URL ?? process.env.SITE_URL ?? "http://localhost:3000";

// Cooldown anti-spam : si le destinataire a reçu un email pour cette
// conversation dans les N dernières minutes, on n'en renvoie pas.
const EMAIL_COOLDOWN_MS = 5 * 60 * 1000;

// Note : `proxifyImageUrl` est désormais importé depuis `./lib/images` (factorisé
// avec convex/social.ts qui en a aussi besoin pour les images des posts Zernio).

// ---------------------------------------------------------------------------
// Helper : récupère l'email + nom d'un user via le composant BetterAuth.
// Renvoie null si pas trouvé (compte supprimé) ou pas d'email.
// ---------------------------------------------------------------------------
async function getUserContact(
  ctx: any,
  userId: string
): Promise<{ email: string; name: string } | null> {
  const user = await authComponent.getAnyUserById(ctx, userId);
  if (!user || !user.email) return null;
  return { email: user.email, name: user.name ?? user.email };
}

// ---------------------------------------------------------------------------
// Envoi HTTP brut vers Resend (utilise le SDK fetch, pas besoin du package).
// Si RESEND_API_KEY absent → on skip silencieusement (log + return null).
// ---------------------------------------------------------------------------
async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[emails] RESEND_API_KEY non défini — email skippé. Configure-le avec `npx convex env set --prod RESEND_API_KEY re_...`"
    );
    return null;
  }

  // Domaine d'expéditeur : par défaut le domaine de test Resend `onboarding@resend.dev`
  // (limité à 100 emails/jour). En prod, override avec EMAIL_FROM = "Osy-Immo <hello@ton-domaine.com>".
  // Note : on évite les adresses "noreply@" car ça réduit la confiance côté Gmail
  // (Resend warning : "Don't use no-reply"). Une vraie adresse permet aux destinataires
  // de répondre — combiné avec Resend Receiving + webhook, on peut router les réponses
  // directement dans la conversation in-app.
  const from = process.env.EMAIL_FROM ?? "Osy-Immo <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[emails] Resend a renvoyé ${res.status}: ${errText}`);
      return null;
    }
    const json = (await res.json()) as { id: string };
    return json;
  } catch (err) {
    console.error("[emails] fetch Resend a planté:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// internalQuery : prépare les données nécessaires à l'envoi d'un email
// pour un message donné. Sépare la lecture (query, déterministe) de
// l'envoi HTTP (action) — c'est le pattern Convex.
// ---------------------------------------------------------------------------
export const prepareMessageEmail = internalQuery({
  args: { conversationId: v.id("conversations"), messageId: v.id("messages") },
  handler: async (ctx, { conversationId, messageId }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return null;
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    const property = await ctx.db.get(conversation.propertyId);

    // Destinataire = l'autre partie de la conversation
    const recipientUserId =
      message.fromUserId === conversation.ownerId
        ? conversation.buyerId
        : conversation.ownerId;

    // Cooldown : si on a envoyé un email à ce destinataire pour cette conv
    // dans les 5 dernières minutes, on skip.
    const cooldownThreshold = Date.now() - EMAIL_COOLDOWN_MS;
    const recent = await ctx.db
      .query("emailNotifications")
      .withIndex("by_conv_recipient", (q) =>
        q
          .eq("conversationId", conversationId)
          .eq("recipientUserId", recipientUserId)
      )
      .order("desc")
      .first();
    const onCooldown =
      recent !== null && recent._creationTime > cooldownThreshold;

    return {
      conversationId,
      recipientUserId,
      senderUserId: message.fromUserId,
      messageBody: message.body,
      propertyId: conversation.propertyId,
      propertyTitle: property?.title ?? "votre annonce",
      // L'image est proxifiée via osy-immo.com pour aligner le domaine d'envoi
      // avec celui des images (warning Resend "Host images on the sending domain").
      propertyImage: proxifyImageUrl(property?.images?.[0]),
      onCooldown,
    };
  },
});

// ---------------------------------------------------------------------------
// internalMutation : enregistre le fait qu'un email a été envoyé.
// Utilisée par l'action ci-dessous pour appliquer le cooldown la prochaine fois.
// ---------------------------------------------------------------------------
export const recordEmailSent = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    recipientUserId: v.string(),
    kind: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("emailNotifications", args);
  },
});

// ---------------------------------------------------------------------------
// internal.action : envoi de l'email "nouveau message" (utilisée par send +
// startConversation, le template diffère légèrement selon le type).
//
// Args : { conversationId, messageId, kind: "new_conversation" | "new_message" }
// ---------------------------------------------------------------------------
export const notifyNewMessage = internalAction({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    kind: v.union(
      v.literal("new_conversation"),
      v.literal("new_message")
    ),
  },
  handler: async (ctx, { conversationId, messageId, kind }) => {
    // 1) Lit la donnée nécessaire dans une query (déterministe, pas d'effet de bord)
    const data = await ctx.runQuery(internal.emails.prepareMessageEmail, {
      conversationId,
      messageId,
    });
    if (!data) return;
    if (data.onCooldown) {
      console.log(
        `[emails] cooldown actif pour ${data.recipientUserId} sur ${conversationId} — skip`
      );
      return;
    }

    // 2) Récupère l'email du destinataire + nom de l'expéditeur
    const recipient = await getUserContact(ctx, data.recipientUserId);
    const sender = await getUserContact(ctx, data.senderUserId);
    if (!recipient) {
      console.warn(
        `[emails] Pas d'email pour user ${data.recipientUserId} — skip`
      );
      return;
    }

    // 3) Construit l'URL du thread (toujours absolue pour les emails)
    const threadUrl = `${APP_URL}/dashboard/messages/${conversationId}`;

    // 4) Choisit le template selon le type d'événement
    const { subject, html } =
      kind === "new_conversation"
        ? renderNewConversationEmail({
            recipientName: recipient.name,
            senderName: sender?.name ?? "Un utilisateur",
            propertyTitle: data.propertyTitle,
            propertyImage: data.propertyImage,
            messageBody: data.messageBody,
            threadUrl,
          })
        : renderNewMessageEmail({
            recipientName: recipient.name,
            senderName: sender?.name ?? "Un utilisateur",
            propertyTitle: data.propertyTitle,
            propertyImage: data.propertyImage,
            messageBody: data.messageBody,
            threadUrl,
          });

    // 5) Envoi (no-op si RESEND_API_KEY absent)
    const result = await sendViaResend({ to: recipient.email, subject, html });

    // 6) Enregistre l'envoi pour le cooldown (même si Resend a planté côté API,
    //    on évite de retenter en boucle)
    if (result) {
      await ctx.runMutation(internal.emails.recordEmailSent, {
        conversationId,
        recipientUserId: data.recipientUserId,
        kind,
      });
    }
  },
});
