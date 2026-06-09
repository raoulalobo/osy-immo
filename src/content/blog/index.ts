// src/content/blog/index.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Source UNIQUE de vérité pour tous les articles du blog Osy-Immo.
//
//  Deux exports principaux :
//   - `articles` : tableau de métadonnées (titre, slug, excerpt, image, etc.)
//                  utilisé pour la liste `/blog` et pour la résolution des meta OG.
//   - `articleComponents` : map slug → composant React rendant le corps de l'article.
//                            utilisé par `/blog/$slug` pour rendre le contenu.
//
//  Pourquoi séparer metadata (TS) et body (composants) ?
//   - Les metadata sont des données simples (string) → faciles à filtrer / trier.
//   - Le body est du JSX (riche) → ne peut pas être stringifié simplement.
//   - En important UNIQUEMENT le bon composant à la demande, on garde un bundle léger
//     côté client (en pratique TanStack code-split les routes, donc chaque article
//     n'est téléchargé que si on visite sa page).
//
//  Ajout d'un nouvel article :
//   1. Crée `src/content/blog/<slug>.tsx` exportant un composant default.
//   2. Ajoute une entrée dans `articles` ci-dessous.
//   3. Ajoute le slug dans `articleComponents`.
//   4. Build + deploy.
// -------------------------------------------------------------------------------------------------

import type { ComponentType } from "react";
import TitreFoncier from "./titre-foncier";
import CertificatDePropriete from "./certificat-de-propriete";
import DossierTechnique from "./dossier-technique";
import ImmatriculationDirecte from "./immatriculation-directe";
import ImmatriculationIndirecte from "./immatriculation-indirecte";
import Lotissement from "./lotissement";

export interface BlogArticleMeta {
  slug: string;
  title: string;
  // 150-200 chars : utilisé en og:description et dans la card de la liste
  excerpt: string;
  // URL absolue d'image — passe directement en og:image (Unsplash recommandé pour MVP)
  coverImage: string;
  // ISO date "YYYY-MM-DD" — sert au tri desc dans la liste
  publishedAt: string;
  // Estimation manuelle (mots / 200) — affichée dans la card
  readingTimeMin: number;
  // Tags libres affichés sous le titre — possibilité de filtres futurs
  tags: string[];
}

/**
 * Liste exhaustive des articles, triés par défaut par date décroissante.
 * Les composants associés sont dans `articleComponents` ci-dessous.
 */
export const articles: BlogArticleMeta[] = [
  {
    slug: "titre-foncier",
    title: "Le titre foncier au Cameroun",
    excerpt:
      "L'acte définitif et inattaquable de propriété : pourquoi il est indispensable et comment l'obtenir à travers le Code domanial camerounais.",
    // Image locale optimisée (WebP 76 KB) : un Camerounais présente un vrai titre
    // foncier "République du Cameroun" avec Yaoundé en arrière-plan. Servie via
    // /public/blog/ par Vercel.
    coverImage: "/blog/titre-foncier.webp",
    publishedAt: "2026-05-17",
    readingTimeMin: 5,
    tags: ["Foncier", "Juridique"],
  },
  {
    slug: "certificat-de-propriete",
    title: "Le certificat de propriété : la photo du livre foncier",
    excerpt:
      "Document indispensable avant tout achat immobilier : où l'obtenir, comment vérifier son authenticité, et combien de temps il reste fiable.",
    // Carrefour Nlongkak à Yaoundé (Ariel Nathan ADA MBITA) — environnement urbain
    // où se trouvent les conservations foncières où on va demander le certificat.
    // Source : https://unsplash.com/photos/xppHOgQBNwU
    coverImage:
      "https://images.unsplash.com/photo-1659947234309-804b7fa01cf2?auto=format&fit=crop&w=1200&q=80",
    publishedAt: "2026-05-17",
    readingTimeMin: 4,
    tags: ["Foncier", "Vérification"],
  },
  {
    slug: "dossier-technique",
    title: "Le dossier technique : la fondation matérielle de votre propriété",
    excerpt:
      "Bornage, levés topographiques, procès-verbal : tout ce qu'un géomètre-expert produit avant l'immatriculation, et pourquoi le faire correctement.",
    // Image locale optimisée : géomètre-expert camerounais avec station totale
    // Leica sur un terrain en colline, vue urbaine en arrière-plan. Exactement le
    // métier que décrit l'article.
    coverImage: "/blog/dossier-technique.webp",
    publishedAt: "2026-05-17",
    readingTimeMin: 6,
    tags: ["Géomètre", "Bornage"],
  },
  {
    slug: "immatriculation-directe",
    title: "L'immatriculation directe : obtenir son premier titre foncier",
    excerpt:
      "Procédure officielle, pièces du dossier, délais et coûts réels pour transformer une occupation de fait en propriété de droit au Cameroun.",
    // Vue aérienne d'Akok-Ndoe à Yaoundé (Edouard TAMBA) — habitations sur terres
    // historiquement coutumières, sujet exact de l'immatriculation directe.
    // Source : https://unsplash.com/photos/HV_TYd3KAQA
    coverImage:
      "https://images.unsplash.com/photo-1615463669098-521a22047a1e?auto=format&fit=crop&w=1200&q=80",
    publishedAt: "2026-05-17",
    readingTimeMin: 7,
    tags: ["Procédure", "Immatriculation"],
  },
  {
    slug: "immatriculation-indirecte",
    title: "L'immatriculation indirecte : terres coutumières et droit moderne",
    excerpt:
      "Comment immatriculer une terre détenue traditionnellement par une famille ou un lignage, et pourquoi le palabre coutumier reste central.",
    // Photo authentique du Cameroun oriental (village de Ngervoum) par Ariel
    // Nathan ADA MBITA : route en terre rouge bordée d'arbres, environnement
    // rural villageois où existent justement les terres coutumières détenues
    // par les lignages. Source : https://unsplash.com/photos/HVytxpsuIxg
    coverImage:
      "https://images.unsplash.com/photo-1659947234291-13d4843d0e75?auto=format&fit=crop&w=1200&q=80",
    publishedAt: "2026-05-17",
    readingTimeMin: 8,
    tags: ["Coutume", "Immatriculation"],
  },
  {
    slug: "lotissement",
    title: "Le lotissement : éviter les pièges des terrains à bâtir",
    excerpt:
      "Lotissement légal vs parcellisation sauvage : les 4 documents à exiger avant d'acheter un lot dans les banlieues camerounaises.",
    // Image locale optimisée : vue aérienne d'un lotissement camerounais avec
    // routes en terre rouge latéritique et maisons aux toits colorés — typique des
    // banlieues de Douala/Yaoundé. Corrige aussi le doublon précédent avec
    // immatriculation-indirecte qui partageait la même image.
    coverImage: "/blog/lotissement.webp",
    publishedAt: "2026-05-17",
    readingTimeMin: 7,
    tags: ["Lotissement", "Urbanisme"],
  },
];

/**
 * Map slug → composant React. L'ordre n'a aucune importance ici ;
 * le tri pour l'affichage se fait via `articles` ci-dessus.
 */
export const articleComponents: Record<string, ComponentType> = {
  "titre-foncier": TitreFoncier,
  "certificat-de-propriete": CertificatDePropriete,
  "dossier-technique": DossierTechnique,
  "immatriculation-directe": ImmatriculationDirecte,
  "immatriculation-indirecte": ImmatriculationIndirecte,
  "lotissement": Lotissement,
};

/**
 * Retrouve les meta d'un article par slug. Renvoie `undefined` si inconnu —
 * utilisé par le loader de `/blog/$slug` pour décider de throw `notFound()`.
 */
export function getArticleMeta(slug: string): BlogArticleMeta | undefined {
  return articles.find((a) => a.slug === slug);
}

/**
 * Articles connexes : tous sauf le slug courant, limités à `limit` (3 par défaut).
 * Pour MVP on retourne simplement les plus récents — un algorithme de similarité
 * basé sur les tags pourra venir en phase 2 si besoin.
 */
export function getRelatedArticles(
  currentSlug: string,
  limit = 3
): BlogArticleMeta[] {
  return articles
    .filter((a) => a.slug !== currentSlug)
    .slice(0, limit);
}

/**
 * Sélectionne `count` articles de manière "aléatoire stable par jour".
 *
 * Pourquoi pas `Math.random()` ?
 *   En SSR + hydratation, un random non déterministe produirait des sélections
 *   différentes entre le HTML rendu côté serveur et le re-render côté client →
 *   warning "hydration mismatch" et reflow visuel.
 *
 * Solution :
 *   On dérive un seed des digits du jour courant (UTC) puis on applique un LCG
 *   simple (Linear Congruential Generator). Le résultat est :
 *     - stable pendant 24h (cohérent SSR/CSR pour TOUS les visiteurs du jour)
 *     - différent chaque jour → effet "rotation" sans déranger React
 *
 * Coût runtime : O(count × n) avec n = nb d'articles. Pour 6 articles et 3 sélections,
 *   on parle de <1 ms — aucune charge mesurable, et zéro requête réseau.
 */
export function pickArticlesByDate(count: number): BlogArticleMeta[] {
  // Seed : transforme "2026-05-17" en un entier déterministe
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let seed = 1;
  for (let i = 0; i < today.length; i++) {
    seed = (seed * 31 + today.charCodeAt(i)) | 0;
  }

  // Fisher-Yates partiel pilot par notre LCG
  const pool = [...articles];
  const picked: BlogArticleMeta[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    // LCG (mêmes constantes que Numerical Recipes — suffisant pour un random non-crypto)
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const idx = seed % pool.length;
    picked.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return picked;
}
