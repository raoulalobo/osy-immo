// convex/schema.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Schéma de la base de données Convex pour le marketplace immobilier.
//        Définit les tables, les types des champs et les index optimisés pour les filtres.
//
// Tables :
//  - `properties` : les annonces immobilières (vente / location).
//  - `favorites`  : la relation many-to-many `user <-> property`.
//  - `inquiries`  : demandes de contact envoyées par les visiteurs aux propriétaires.
//
// Note : BetterAuth gère ses propres tables (`users`, `sessions`, `accounts`, ...).
//        Elles sont injectées via le composant `@convex-dev/better-auth` (voir convex.config.ts).
//        Ici on référence l'`userId` (Id<"users">) issu de BetterAuth via les helpers.
//
// Exemple de query :
//   db.query("properties").withIndex("by_status", q => q.eq("status", "active"))
// -------------------------------------------------------------------------------------------------

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Types ouverts (string) pour rester souple — la validation forte se fait côté mutation/UI.
const propertyType = v.union(
  v.literal("apartment"),
  v.literal("house"),
  v.literal("land"),
  v.literal("commercial")
);

const listingType = v.union(v.literal("sale"), v.literal("rent"));

const propertyStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("sold"),
  v.literal("rented"),
  v.literal("archived")
);

export default defineSchema({
  // -------------------------------------------------------------------
  // properties — toutes les annonces visibles dans le marketplace
  // -------------------------------------------------------------------
  properties: defineTable({
    ownerId: v.string(),               // ID utilisateur BetterAuth (chaîne)
    title: v.string(),                  // Ex : "Appartement T3 lumineux Lyon 6e"
    description: v.string(),
    type: propertyType,                 // apartment | house | land | commercial
    listingType,                        // sale | rent
    status: propertyStatus,             // draft | active | sold | rented | archived
    price: v.number(),                  // En FCFA (loyer mensuel si rent)
    surface: v.number(),                // m² total
    rooms: v.optional(v.number()),      // nombre de pièces (null pour terrain)
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    yearBuilt: v.optional(v.number()),
    energyClass: v.optional(v.string()),// A..G
    // Localisation
    address: v.string(),
    city: v.string(),
    // Code postal optionnel — peu courant au Cameroun.
    postalCode: v.optional(v.string()),
    // Région administrative (Cameroun a 10 régions : Centre, Littoral, Ouest, etc.)
    region: v.optional(v.string()),
    country: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    // Médias — URLs stables retournées par `ctx.storage.getUrl(storageId)`
    // ou URLs externes (Unsplash etc.) selon le cas.
    // Limites côté UI : 10 images, 5 vidéos (cf. src/components/MediaUploader.tsx).
    images: v.array(v.string()),
    videos: v.optional(v.array(v.string())),
    // Dérivé Open Graph : vignette 1200×630 JPEG optimisée (< ~150 Ko) générée
    // côté serveur à partir de `images[0]` (cf. convex/ogImage.ts). Sert d'image
    // d'aperçu pour les liens partagés (WhatsApp/Facebook/iMessage), à la place
    // de la photo brute (souvent > 2 Mo → aperçu rejeté par WhatsApp).
    //   - `ogImage`   : URL proxifiée osy-immo.com/img/convex/<id>, prête pour og:image.
    //   - `ogImageId` : storageId du dérivé, conservé pour le supprimer/regénérer.
    // Optional : peuplé en asynchrone après l'upload (annonces récentes) ou via
    // `npx convex run ogImage:backfillOgImages` (annonces antérieures).
    ogImage: v.optional(v.string()),
    ogImageId: v.optional(v.id("_storage")),
    features: v.array(v.string()),      // ["piscine", "garage", "balcon"]
    publishedAt: v.optional(v.number()),// epoch ms
    // Short-slug 6 caractères (alphabet sans 0/O/I/l) — sert à construire
    // des URLs courtes `osy-immo.com/p/<slug>` qui rentrent dans la limite
    // 90 chars du titre TikTok. La route `/p/$slug` redirige vers la fiche.
    // Optional pour rétro-compat avec les annonces créées avant ce champ
    // (backfillées via `properties:backfillShortSlugs`).
    shortSlug: v.optional(v.string()),
    // Choix utilisateur : quel média est publié sur les réseaux sociaux
    // (Facebook + Instagram + TikTok via Zernio) quand l'annonce passe en
    // active.
    //   - "images" : carrousel des images (comportement historique, défaut)
    //   - "video"  : la première vidéo (videos[0]) en post vidéo natif
    // Optional pour rétro-compat — les annonces existantes retombent sur
    // "images" côté lecture (cf. convex/social.ts:preparePost).
    socialMediaChoice: v.optional(
      v.union(v.literal("images"), v.literal("video"))
    ),
  })
    // Filtres fréquents :
    // `publishedAt` en dernier champ des 3 index de listing = ordre de tri
    // natif pour `.paginate()` + `.order("desc")` (les plus récemment publiées
    // d'abord, cf. properties.listPaginated). Les documents sans `publishedAt`
    // (champ optionnel, antérieurs à son introduction) tombent en fin de liste
    // en desc. Les callbacks `withIndex` existants restent valides : on
    // n'égalise jamais sur `publishedAt`, seul le préfixe d'égalité compte.
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status", "publishedAt"])
    .index("by_city", ["city", "status", "publishedAt"])
    .index("by_listingType_status", ["listingType", "status", "publishedAt"])
    .index("by_price", ["price"])
    // Lookup en O(1) pour `properties.getByShortSlug`
    .index("by_short_slug", ["shortSlug"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["status", "city", "type", "listingType"],
    }),

  // -------------------------------------------------------------------
  // favorites — chaque ligne représente un favori d'un user sur une annonce
  // -------------------------------------------------------------------
  favorites: defineTable({
    userId: v.string(),                 // BetterAuth user id
    propertyId: v.id("properties"),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_property", ["userId", "propertyId"])
    .index("by_property", ["propertyId"]),

  // -------------------------------------------------------------------
  // events — analytics produit (vues, partages, conversions)
  //
  // Conçu pour répondre à 3 questions clés du marketplace :
  //   1. Combien de vues par annonce, sur quelle période, depuis quelle source ?
  //   2. Quels utilisateurs partagent le plus efficacement (?ref=<userId>) ?
  //   3. Quel est le taux de conversion vue → contact ?
  //
  // Dédup : `sessionHash` (généré côté client en localStorage) permet d'éviter
  //          de compter plusieurs fois la même personne qui rafraîchit.
  // -------------------------------------------------------------------
  events: defineTable({
    propertyId: v.id("properties"),
    // view = page détail consultée
    // share = bouton Partager cliqué (WhatsApp ou copier le lien)
    // share_click = arrivée sur une annonce VIA un lien partagé (utm_source défini)
    // favorite = ajout aux favoris (toggle ON)
    // contact = formulaire de contact envoyé
    type: v.union(
      v.literal("view"),
      v.literal("share"),
      v.literal("share_click"),
      v.literal("favorite"),
      v.literal("contact"),
    ),
    // ID utilisateur qui a partagé l'annonce, capturé via ?ref=<userId>
    refUserId: v.optional(v.string()),
    // Canal d'arrivée TAGGÉ : "whatsapp", "copy", "facebook", etc.
    // Posé via `?utm_source=...` dans l'URL — la priorité dans les stats
    // quand présent. Voir ShareButton.tsx qui pose cette valeur.
    utmSource: v.optional(v.string()),
    // Canal d'arrivée INFÉRÉ depuis le HTTP Referer (Phase 2).
    // Calculé côté client par `classifyReferrer()` avant l'envoi à events.record.
    // Valeurs : "direct" | "internal" | "google" | "bing" | "duckduckgo"
    //          | "qwant" | "yahoo" | "ecosia" | "brave" | "external"
    // Utilisé en fallback quand `utmSource` est absent — permet de distinguer
    // une visite "tapée à la main" (direct), une nav interne, et un click
    // depuis un moteur de recherche.
    // Optionnel : les events historiques d'avant ce champ tombent en "direct".
    referrerSource: v.optional(v.string()),
    // Géolocalisation approximative (Phase 2 — pour l'instant on capture côté front si dispo)
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    // "mobile" | "tablet" | "desktop" — parsé depuis User-Agent
    device: v.optional(v.string()),
    // Hash anonyme stocké en localStorage pour dédupliquer sans cookie tiers
    sessionHash: v.optional(v.string()),
  })
    // Stats par annonce sur une période : `by_property_day`.
    // Convex ajoute automatiquement `_creationTime` à la fin de chaque index,
    // ce qui permet le filtre `.gte("_creationTime", since)` sans le déclarer.
    .index("by_property", ["propertyId"])
    // Stats par type : "combien de vues sur cette annonce ?"
    .index("by_property_type", ["propertyId", "type"])
    // "Top partageurs" : agrégation par refUserId
    .index("by_ref_user", ["refUserId"]),

  // -------------------------------------------------------------------
  // conversations — fil de messagerie entre un acheteur potentiel et le
  // propriétaire d'une annonce. UNE conversation par couple (property, buyer)
  // pour éviter la fragmentation des échanges.
  //
  // Dénormalisation volontaire : `lastMessage*` et `unreadFor*` sont mis à jour
  // dans la même mutation que `messages.insert` pour permettre des listes
  // performantes (pas besoin d'agréger les messages à chaque chargement).
  // -------------------------------------------------------------------
  conversations: defineTable({
    propertyId: v.id("properties"),
    // ID utilisateur acheteur (la personne qui a démarré la conversation)
    buyerId: v.string(),
    // ID utilisateur propriétaire (extrait de l'annonce au moment de la création)
    ownerId: v.string(),
    // Aperçu du dernier message (≤ 200 chars) pour l'affichage rapide en liste
    lastMessagePreview: v.string(),
    // Timestamp du dernier message (pour le tri "le plus récent en haut")
    lastMessageAt: v.number(),
    // Compteurs de non-lus par rôle — incrémentés à chaque send, remis à 0 par markRead
    unreadForOwner: v.number(),
    unreadForBuyer: v.number(),
  })
    // Tri "mes conversations en tant qu'owner, plus récente d'abord"
    .index("by_owner", ["ownerId"])
    .index("by_buyer", ["buyerId"])
    // Empêche les doublons : 1 seule conversation par couple (property, buyer)
    .index("by_property_and_buyer", ["propertyId", "buyerId"]),

  // -------------------------------------------------------------------
  // messages — un message individuel à l'intérieur d'une conversation
  // -------------------------------------------------------------------
  messages: defineTable({
    conversationId: v.id("conversations"),
    // Auteur du message (buyerId ou ownerId selon le sens)
    fromUserId: v.string(),
    body: v.string(),
    // Date à laquelle le DESTINATAIRE a marqué ce message comme lu
    readAt: v.optional(v.number()),
  })
    // Liste les messages d'une conversation par ordre chronologique
    .index("by_conversation", ["conversationId"]),

  // -------------------------------------------------------------------
  // emailNotifications — historique des emails envoyés via Resend.
  // Sert à appliquer un cooldown (anti-spam) : on évite d'envoyer un
  // email pour CHAQUE message dans une conversation active.
  // -------------------------------------------------------------------
  emailNotifications: defineTable({
    conversationId: v.id("conversations"),
    recipientUserId: v.string(),
    // "new_conversation" | "new_message" | (futurs types : "weekly_recap"...)
    kind: v.string(),
  })
    // Lookup rapide : "quand le dernier email a-t-il été envoyé pour cette
    // conversation à ce destinataire ?" — pour vérifier le cooldown.
    .index("by_conv_recipient", ["conversationId", "recipientUserId"]),

  // -------------------------------------------------------------------
  // favoriteStatusNotifications — registre des emails « le bien que vous
  // suiviez n'est plus disponible » envoyés aux utilisateurs ayant mis une
  // annonce en favori, quand celle-ci passe à "sold" / "rented".
  //
  // Rôle : IDEMPOTENCE. Garantit qu'un même destinataire ne reçoit l'email
  // qu'UNE seule fois pour un couple (annonce, statut), même si le
  // propriétaire bascule plusieurs fois le statut (ex. sold → active → sold)
  // ou si la mutation `update` est rejouée. Voir convex/emails.ts
  // (prepareFavoriteStatusEmail filtre les destinataires déjà présents ici).
  // -------------------------------------------------------------------
  favoriteStatusNotifications: defineTable({
    propertyId: v.id("properties"),
    recipientUserId: v.string(),          // BetterAuth user id du favori notifié
    // Statut déclencheur au moment de la notification : "sold" | "rented".
    // String libre (et non union) pour rester souple si on étend plus tard.
    status: v.string(),
  })
    // Lookup d'idempotence : "a-t-on déjà notifié CE destinataire pour CE
    // bien passé à CE statut ?" — l'ordre des champs suit l'usage de la query.
    .index("by_property_status_recipient", [
      "propertyId",
      "status",
      "recipientUserId",
    ]),

  // -------------------------------------------------------------------
  // inquiries — formulaire de contact envoyé à un propriétaire
  // (utilisé par les visiteurs anonymes ; les utilisateurs connectés
  // passent par la messagerie interne ci-dessus)
  // -------------------------------------------------------------------
  inquiries: defineTable({
    propertyId: v.id("properties"),
    fromUserId: v.optional(v.string()),
    fromName: v.string(),
    fromEmail: v.string(),
    fromPhone: v.optional(v.string()),
    message: v.string(),
    status: v.union(
      v.literal("new"),
      v.literal("read"),
      v.literal("responded"),
      v.literal("archived")
    ),
  })
    .index("by_property", ["propertyId"])
    .index("by_from_user", ["fromUserId"]),

  // -------------------------------------------------------------------
  // userProfiles — extension custom des profils Better Auth.
  //
  // Pourquoi pas dans Better Auth `user.additionalFields` ?
  //   Le composant @convex-dev/better-auth déclare un schema Convex FIXE
  //   pour sa table interne `user` (cf. node_modules/.../component/schema.js).
  //   Les `additionalFields` déclarés côté createAuth() ne sont PAS reflétés
  //   en colonnes Convex → patch silencieusement ignoré → bio/phone non
  //   persistés. On les stocke donc dans notre propre table.
  //
  // Champs stockés ici :
  //   - bio   : description courte (≤ 300 chars), VISIBLE publiquement
  //             dans la mini-card vendeur sur les annonces.
  //   - phone : numéro de téléphone, PRIVÉ — jamais retourné publiquement.
  //
  // Champs gérés par Better Auth (donc PAS dupliqués ici) :
  //   - name, email, image, emailVerified : modifiables via authClient.updateUser
  //
  // Pas de FK Convex sur `userId` (= Better Auth user._id, type string) car
  // la table user vit dans un composant séparé.
  // -------------------------------------------------------------------
  userProfiles: defineTable({
    userId: v.string(),
    bio: v.optional(v.string()),
    phone: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // -------------------------------------------------------------------
  // socialPosts — historique des publications automatiques Zernio
  // (Facebook + Instagram + TikTok) déclenchées par properties.update
  // lors de la transition draft → active.
  //
  // Cycle de vie d'une ligne :
  //   1. insert(status: "pending")  — réservation avant l'appel HTTP
  //   2. patch(status: "published" | "partial" | "failed" | "skipped_no_images",
  //            zernioPostId?, errorMessage?, platformResults?)
  //
  // Statut "partial" : POST Zernio a renvoyé 2xx MAIS au moins une plateforme
  // a échoué (ex. TikTok rejette l'UX validation alors que Facebook publie).
  // Permet le retry sélectif via `retryFailedPlatforms` — voir social.ts.
  //
  // Idempotence : on bloque un nouveau full-publish si une ligne existe pour
  // ce propertyId, MAIS on autorise le retry des plateformes en échec via
  // l'action `retryFailedPlatforms` (qui re-poste uniquement les `failed`).
  // -------------------------------------------------------------------
  socialPosts: defineTable({
    propertyId: v.id("properties"),
    // ID du post agrégé renvoyé par POST https://zernio.com/api/v1/posts.
    // Permet de relancer / supprimer / commenter le post plus tard via l'API.
    zernioPostId: v.optional(v.string()),
    // Plateformes ciblées (audit + futures stats). Ex: ["facebook", "instagram", "tiktok"].
    platforms: v.array(v.string()),
    // pending           — ligne réservée juste avant le fetch HTTP (verrou idempotent)
    // published         — Toutes les plateformes ciblées ont réussi côté Zernio
    // partial           — Zernio a renvoyé 2xx mais au moins une plateforme est failed
    //                     (ex. TikTok rejette l'UX, mais Facebook publie). Retry possible.
    // failed            — Zernio 4xx/5xx OU fetch a planté OU toutes les plateformes en échec
    // skipped_no_images — l'annonce n'a aucune image utilisable (URLs non HTTPS)
    status: v.union(
      v.literal("pending"),
      v.literal("published"),
      v.literal("partial"),
      v.literal("failed"),
      v.literal("skipped_no_images")
    ),
    // Diagnostic en cas d'échec. Tronqué à 200 caractères pour éviter de
    // leaker un éventuel reflect de la clé API dans les logs.
    errorMessage: v.optional(v.string()),
    // Résultat détaillé par plateforme (rempli après le POST Zernio).
    // Permet d'identifier précisément quelles plateformes ont échoué et
    // de les retenter sélectivement via `retryFailedPlatforms`.
    //
    // Ex : [
    //   {platform:"facebook", status:"published",
    //    platformPostUrl:"https://facebook.com/..."},
    //   {platform:"tiktok",   status:"failed",
    //    errorMessage:"TikTok UX validation failed: ..."}
    // ]
    platformResults: v.optional(
      v.array(
        v.object({
          platform: v.string(),
          // "published" / "failed" — copie directe du status renvoyé par Zernio
          // par plateforme dans la réponse POST /v1/posts.
          status: v.string(),
          // URL publique du post sur la plateforme (FB, IG, TikTok). Absent si failed.
          platformPostUrl: v.optional(v.string()),
          // ID interne du post côté plateforme — utile pour debug.
          platformPostId: v.optional(v.string()),
          // Message d'erreur retourné par la plateforme (ex. validation TikTok).
          errorMessage: v.optional(v.string()),
        })
      )
    ),
  })
    // Idempotence : avant chaque tentative on vérifie qu'aucune ligne
    // n'existe déjà pour ce propertyId.
    .index("by_property", ["propertyId"]),

  // -------------------------------------------------------------------
  // aiUsage — compteur anti-abus pour la génération d'annonces par IA
  // (action `ai.generateListing` qui appelle DeepSeek).
  //
  // Rôle : limiter le nombre de générations par utilisateur sur une
  //        fenêtre glissante d'1 heure, pour éviter qu'un user ne
  //        consomme tout le budget de l'API DeepSeek (coût + abus).
  //
  // Modèle "fenêtre glissante simple" — 1 seule ligne par utilisateur :
  //   - `windowStart` : timestamp (ms) du début de la fenêtre courante.
  //   - `count`       : nombre de générations effectuées dans cette fenêtre.
  //   Quand `now - windowStart > 1h`, la fenêtre est réinitialisée
  //   (windowStart = now, count = 1). Sinon on incrémente `count` tant
  //   qu'il reste sous la limite. Logique implémentée dans
  //   `ai.checkAndBumpQuota` (convex/ai.ts).
  //
  // Exemple :
  //   { userId: "abc123", count: 7, windowStart: 1717500000000 }
  //   → 7 générations faites depuis le début de l'heure glissante.
  // -------------------------------------------------------------------
  aiUsage: defineTable({
    userId: v.string(),       // ID utilisateur BetterAuth (chaîne)
    count: v.number(),        // nb de générations dans la fenêtre courante
    windowStart: v.number(),  // epoch ms — début de la fenêtre glissante 1h
  })
    // Lookup O(1) "quel est l'usage de cet utilisateur ?" dans checkAndBumpQuota.
    .index("by_user", ["userId"]),
});
