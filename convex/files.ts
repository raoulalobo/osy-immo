// convex/files.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Gestion des uploads de médias (images, vidéos) via Convex Storage.
//
// Workflow upload :
//   1. Le client appelle `generateUploadUrl()` → reçoit une URL signée valable ~1h.
//   2. Le client fait un POST direct sur cette URL avec le `File` (multipart inutile,
//      `body: file` suffit). Convex renvoie `{ storageId }`.
//   3. Le client appelle `getUrl({ storageId })` (ou `urlOf` côté mutation) pour
//      obtenir une URL CDN stable, qu'on stocke dans la doc `properties`.
//
// Sécurité : `generateUploadUrl` exige une session authentifiée — sinon, n'importe
//            quel visiteur pourrait flooder le storage.
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

/**
 * Génère une URL temporaire (~1h) pour upload direct depuis le navigateur.
 * Seuls les utilisateurs authentifiés y ont accès.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Connexion requise pour uploader un fichier.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Renvoie l'URL CDN stable d'un fichier stocké, à partir de son `storageId`.
 * Utilisée côté client juste après l'upload pour stocker l'URL dans la doc.
 */
export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});
