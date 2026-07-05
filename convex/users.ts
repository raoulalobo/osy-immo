// convex/users.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Queries et mutations sur les profils utilisateurs.
//
//   Architecture hybride :
//     - Better Auth gère les champs natifs (name, email, emailVerified, image)
//       via la table `user` du composant @convex-dev/better-auth.
//     - Notre table custom `userProfiles` (cf. convex/schema.ts) stocke les
//       champs supplémentaires `bio` et `phone` — qu'on ne peut pas mettre
//       dans Better Auth car son schema Convex est verrouillé.
//
//   Les callers consomment :
//     - `getPublicProfile({ userId })` pour afficher la mini-card vendeur
//     - `getMyProfile` pour pré-remplir le form `/dashboard/profile`
//     - `updateMyProfile({ bio, phone })` pour persister les champs custom
//       (name + image continuent d'être mis à jour via authClient.updateUser
//       de Better Auth, séparément).
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth, authComponent } from "./auth";

// Caps validation côté serveur (défense en profondeur, l'UI valide aussi).
const BIO_MAX = 300;
const PHONE_MAX = 30;

/**
 * Renvoie le profil PUBLIC d'un utilisateur — affiché dans la mini-card
 * vendeur sur la page détail d'annonce (`/properties/:id`).
 *
 * Joint la table Better Auth `user` (pour name + image) ET notre table
 * `userProfiles` (pour bio).
 *
 * Champs retournés : name, image, bio.
 * Champs JAMAIS retournés : email, phone, emailVerified — PII privées.
 */
export const getPublicProfile = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // 1) Champs natifs Better Auth
    // try/catch indispensable : getAnyUserById fait un db.get interne qui
    // LÈVE si userId n'est pas un ID Convex décodable (ex. "seed-owner" des
    // données de démo, ou tout identifiant orphelin/corrompu). Sans cette
    // garde, l'exception remonte au client et le error boundary global
    // remplace toute la page détail par « Something went wrong! ».
    // Un ID non résoluble ≡ utilisateur introuvable → null (contrat existant,
    // le frontend masque simplement la mini-card vendeur).
    let user;
    try {
      user = await authComponent.getAnyUserById(ctx, userId);
    } catch {
      return null;
    }
    if (!user) return null;
    const u = user as any;

    // 2) Champs custom dans userProfiles (bio uniquement — phone reste privé)
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return {
      _id: user._id,
      name: u.name as string | undefined,
      image: u.image as string | null | undefined,
      bio: profile?.bio,
      // ❌ JAMAIS : email, phone, emailVerified
    };
  },
});

/**
 * Renvoie le profil PRIVÉ COMPLET du user authentifié — utilisé par la page
 * `/dashboard/profile` pour pré-remplir le formulaire.
 *
 * Inclut le téléphone car c'est l'user lui-même qui le consulte.
 * Retourne `null` si pas connecté.
 */
export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      bio: profile?.bio ?? "",
      phone: profile?.phone ?? "",
    };
  },
});

/**
 * Met à jour les champs custom (bio, phone) du user authentifié.
 *
 * Sécurité : owner-only (le userId est lu côté serveur via auth.getAuthUserId,
 * pas accepté en argument — impossible d'éditer le profil d'un autre user).
 *
 * Logique : upsert sur la table userProfiles via l'index by_user.
 *
 * Validation : caps de longueur côté serveur (BIO_MAX, PHONE_MAX). L'UI
 * valide déjà en plus, mais on garde la barrière serveur en défense en
 * profondeur (Finding #1 audit security 260601 — toutes les inputs string
 * doivent être bornées pour éviter le storage DoS).
 */
export const updateMyProfile = mutation({
  args: {
    bio: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, { bio, phone }) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) throw new Error("Authentification requise.");

    // Validation longueurs serveur — bonus de défense en profondeur
    if (bio !== undefined && bio.length > BIO_MAX) {
      throw new Error(`La bio dépasse ${BIO_MAX} caractères.`);
    }
    if (phone !== undefined && phone.length > PHONE_MAX) {
      throw new Error(`Le téléphone dépasse ${PHONE_MAX} caractères.`);
    }

    // Upsert via l'index by_user
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      // Patch partiel : on ne touche QUE les champs explicitement passés.
      // Si bio est undefined dans args, on garde la valeur existante.
      const patch: { bio?: string; phone?: string } = {};
      if (bio !== undefined) patch.bio = bio;
      if (phone !== undefined) patch.phone = phone;
      await ctx.db.patch(existing._id, patch);
    } else {
      // Création d'une nouvelle ligne — bio/phone à `undefined` sont OK
      // (validateur v.optional accepte l'absence).
      await ctx.db.insert("userProfiles", {
        userId,
        bio: bio,
        phone: phone,
      });
    }
  },
});
