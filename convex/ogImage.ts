"use node";
// convex/ogImage.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Génère le dérivé "Open Graph" d'une annonce — une vignette 1200×630 JPEG
//        optimisée (< ~150 Ko) à partir de la photo principale `images[0]`.
//
// Pourquoi ?
//   La balise og:image des fiches d'annonce pointait sur la photo BRUTE uploadée
//   (souvent > 2 Mo, dimensions arbitraires). Résultat : WhatsApp (canal de
//   partage dominant au Cameroun) ne génère pas d'aperçu au-delà de ~300 Ko, et
//   plusieurs crawlers rejettent une image dont le type/dimensions déclarés
//   (1200×630 JPEG) ne correspondent pas au fichier réel. On pré-calcule donc un
//   dérivé propre, stocké dans Convex storage, qui rend les balises og:image:*
//   enfin EXACTES (cf. src/routes/properties.$id.tsx).
//
// Runtime Node (`"use node"`) :
//   On traite l'image avec `jimp` (pur JavaScript) plutôt que `sharp` : le
//   runtime Convex est linux-arm64 et le binaire natif de sharp (libvips) n'y est
//   pas chargeable ("Could not load the sharp module using the linux-arm64
//   runtime"). jimp n'a aucune dépendance native → il se bundle de façon fiable.
//   `"use node"` reste requis (jimp s'appuie sur Buffer / APIs Node). Un fichier
//   `"use node"` ne peut contenir QUE des actions — la mutation d'écriture
//   (`setOgImage`) et la query de lecture vivent donc dans convex/properties.ts.
//
// Déclenchement :
//   - convex/properties.ts:create()  → quand une annonce avec image est créée.
//   - convex/properties.ts:update()  → quand `images` change ou à la 1re publication.
//   - backfillOgImages (ci-dessous)  → one-shot pour les annonces antérieures.
//
// Tolérance aux pannes : chaque étape réseau/traitement est encapsulée ; en cas
// d'échec on log et on s'arrête sans écrire (l'og:image retombe alors sur la
// photo brute via le fallback de la route — comportement historique).
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import Jimp from "jimp";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { proxifyImageUrl } from "./lib/images";

// Dimensions cibles de l'aperçu — ratio 1.91:1 recommandé par Open Graph /
// Facebook / WhatsApp. Doivent rester synchronisées avec les balises
// og:image:width / og:image:height de src/routes/properties.$id.tsx.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_JPEG_QUALITY = 80; // bon compromis netteté / poids (~80–150 Ko en sortie)

/**
 * Génère (ou régénère) le dérivé OG d'une annonce à partir de `images[0]`.
 *
 * Idempotent : remplace l'`ogImage`/`ogImageId` existant ; l'ancien fichier
 * storage est supprimé par `setOgImage` (évite les orphelins).
 */
export const generateOgImage = internalAction({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, { propertyId }) => {
    // 1) Charge l'annonce (réutilise l'internalQuery existante de social.ts qui
    //    renvoie le document complet). Cast léger : l'inférence TS se dégrade en
    //    `any` à travers `internal.social.*` (cycle d'imports Convex).
    const property = (await ctx.runQuery(
      internal.social.getPropertyForRepost,
      { propertyId }
    )) as { images?: string[] } | null;
    if (!property) return; // annonce supprimée entre-temps
    const src = property.images?.[0];
    if (!src) return; // pas d'image → rien à dériver

    // 2) Télécharge les octets de la photo principale.
    let inputBuffer: Buffer;
    try {
      const res = await fetch(src);
      if (!res.ok) {
        console.warn(
          `[ogImage] fetch source ${propertyId} a renvoyé ${res.status} — skip.`
        );
        return;
      }
      inputBuffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.error(`[ogImage] fetch source ${propertyId} a planté:`, err);
      return;
    }

    // 3) Redimensionne en 1200×630 (recadrage centré "cover") + ré-encode en JPEG.
    //    jimp.cover(w,h) met l'image à l'échelle pour remplir la zone puis recadre
    //    le surplus au centre — équivalent du `fit: "cover"` de sharp.
    //    NB : jimp ne décode pas le WebP ; une source WebP lèvera ici → on log et
    //    on retombe sur la photo brute (comportement historique).
    let jpeg: Buffer;
    try {
      const image = await Jimp.read(inputBuffer);
      image.cover(OG_WIDTH, OG_HEIGHT);
      image.quality(OG_JPEG_QUALITY);
      jpeg = await image.getBufferAsync(Jimp.MIME_JPEG);
    } catch (err) {
      console.error(`[ogImage] jimp a échoué pour ${propertyId}:`, err);
      return;
    }

    // 4) Stocke le dérivé dans Convex storage et résout son URL stable.
    // Enveloppe dans un Uint8Array : le type `Buffer` de jimp n'est pas accepté
    // directement comme BlobPart (incompatibilité ArrayBuffer/SharedArrayBuffer).
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" })
    );
    const url = await ctx.storage.getUrl(storageId);
    if (!url) {
      console.error(`[ogImage] getUrl null pour le dérivé de ${propertyId}.`);
      return;
    }

    // 5) Proxifie l'URL vers osy-immo.com/img/convex/<id> (cohérent avec le reste
    //    du projet : images "hébergées sur le domaine d'envoi") puis persiste.
    const ogImage = proxifyImageUrl(url) ?? url;
    await ctx.runMutation(internal.properties.setOgImage, {
      propertyId,
      ogImage,
      ogImageId: storageId,
    });
    console.log(`[ogImage] ✓ dérivé OG généré pour ${propertyId} (${ogImage})`);
  },
});

/**
 * one-shot : génère le dérivé OG pour toutes les annonces qui ont une image mais
 * pas encore d'`ogImage`. À lancer via :
 *   npx convex run --prod ogImage:backfillOgImages
 *
 * On échelonne les générations (250 ms entre chacune) pour lisser la charge
 * réseau/CPU et éviter un pic de fetchs simultanés. Idempotent : relançable sans
 * risque (saute les annonces déjà pourvues).
 */
export const backfillOgImages = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number; total: number }> => {
    const rows = (await ctx.runQuery(
      internal.properties.listForOgBackfill,
      {}
    )) as Array<{ _id: string; hasImage: boolean; hasOgImage: boolean }>;
    let scheduled = 0;
    for (const r of rows) {
      if (!r.hasImage || r.hasOgImage) continue;
      await ctx.scheduler.runAfter(
        scheduled * 250,
        internal.ogImage.generateOgImage,
        { propertyId: r._id as any }
      );
      scheduled++;
    }
    console.log(
      `[ogImage] backfill : ${scheduled} dérivé(s) planifié(s) sur ${rows.length} annonce(s).`
    );
    return { scheduled, total: rows.length };
  },
});
