// src/lib/og.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Construit le bloc de balises <meta> Open Graph + Twitter Card d'une
//        annonce, partagé entre :
//          - src/routes/properties.$id.tsx  (fiche détaillée)
//          - src/routes/p.$slug.tsx         (lien court partagé sur les réseaux)
//
// Pourquoi factoriser ?
//   Les liens courts `/p/<slug>` (utilisés par les posts TikTok/Facebook) font
//   une redirection CÔTÉ CLIENT vers la fiche. Or WhatsApp/Facebook/TikTok ne
//   suivent pas le JavaScript : sans balises OG propres sur `/p/<slug>`, l'aperçu
//   du lien court est vide. On réutilise donc ici exactement la même logique que
//   la fiche pour que les deux URLs produisent le même aperçu riche.
//
// Note image : on privilégie le dérivé OG optimisé (`property.ogImage`,
// 1200×630 JPEG < ~150 Ko, cf. convex/ogImage.ts), seul format que WhatsApp
// accepte de manière fiable. Repli sur la photo brute puis sur l'image par défaut.
// -------------------------------------------------------------------------------------------------

import type { Doc } from "../../convex/_generated/dataModel";
import { formatArea, formatPrice, getPublicUrl } from "./utils";

/**
 * Génère l'objet `{ meta: [...] }` attendu par le `head()` d'une route TanStack
 * pour une annonce donnée.
 *
 * L'`og:url` pointe TOUJOURS sur la fiche canonique `/properties/<id>` (même
 * lorsqu'on partage un lien court `/p/<slug>`), pour consolider le partage et
 * le SEO sur une seule URL.
 */
export function buildPropertyOgMeta(property: Doc<"properties">) {
  const url = getPublicUrl(`/properties/${property._id}`);
  // Priorité au dérivé OG optimisé : il rend les balises og:image:width/height/type
  // ci-dessous EXACTES et passe la limite de poids de WhatsApp. Repli sur la photo
  // brute tant que le dérivé n'est pas généré, puis sur l'image par défaut.
  const image =
    property.ogImage ?? property.images[0] ?? getPublicUrl("/og-default.jpg");

  // Le prix est mis en évidence à deux endroits (titre + description) car les
  // cartes d'aperçu n'ont pas de "slot" prix natif : seuls title, description et
  // image sont rendus visuellement.
  const priceLabel =
    property.listingType === "rent"
      ? `${formatPrice(property.price)} /mois`
      : formatPrice(property.price);

  const summaryParts = [priceLabel, property.city, formatArea(property.surface)];
  if (property.rooms !== undefined) {
    summaryParts.push(`${property.rooms} pièces`);
  }
  const summary = summaryParts.join(" · ");

  // Description finale : ligne de résumé scannable + description originale,
  // tronquée à 200 caractères (limite confortable OG/Twitter).
  const fullDescription = `${summary}\n\n${property.description}`;
  const desc =
    fullDescription.length > 200
      ? fullDescription.slice(0, 197) + "…"
      : fullDescription;

  // Préfixe statut pour les annonces non-active — visible dans l'aperçu ET dans
  // l'onglet du navigateur (évite qu'on clique sur une annonce déjà vendue/louée).
  const statusPrefix =
    property.status === "sold"
      ? "[VENDU] "
      : property.status === "rented"
        ? "[LOUÉ] "
        : property.status === "archived"
          ? "[RETIRÉ] "
          : "";
  const ogTitle = `${statusPrefix}${property.title} — ${priceLabel}`;
  const pageTitle = `${ogTitle} | Osy-Immo`;

  return {
    meta: [
      { title: pageTitle },
      { name: "description", content: desc },
      // Open Graph — WhatsApp, Facebook, LinkedIn, iMessage, Slack.
      // Les og:image:width/height/type sont déclarés explicitement (WhatsApp les
      // utilise pour la mise en page sans télécharger l'image). Ils sont EXACTS
      // dès que `property.ogImage` (1200×630 JPEG) est utilisé.
      { property: "og:type", content: "website" },
      { property: "og:title", content: ogTitle },
      { property: "og:description", content: desc },
      { property: "og:image", content: image },
      { property: "og:image:secure_url", content: image },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: property.title },
      { property: "og:url", content: url },
      { property: "og:site_name", content: "Osy-Immo" },
      { property: "og:locale", content: "fr_CM" },
      // Métadonnées "product" structurées (exploitées par Google / lecteurs RSS).
      { property: "product:price:amount", content: String(property.price) },
      { property: "product:price:currency", content: "XAF" },
      // Twitter Card — aperçu riche sur Twitter/X.
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: ogTitle },
      { name: "twitter:description", content: desc },
      { name: "twitter:image", content: image },
      { name: "twitter:label1", content: "Prix" },
      { name: "twitter:data1", content: priceLabel },
      { name: "twitter:label2", content: "Localisation" },
      { name: "twitter:data2", content: property.city },
    ],
  };
}
