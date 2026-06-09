// src/routes/blog.index.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Page liste du blog `/blog`.
//
//        Affiche un hero court + une grille des articles existants, triés par date
//        décroissante. Chaque card linke vers `/blog/$slug` qui rend l'article complet.
//
// SEO :
//   - `head()` statique (le contenu de la liste évolue peu) : og:title générique
//     "Blog · Osy-Immo", description courte.
//   - Pas de loader Convex nécessaire — les articles sont 100% en-bundle TypeScript.
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Clock } from "lucide-react";
import { Breadcrumb } from "~/components/Breadcrumb";
import { articles, type BlogArticleMeta } from "~/content/blog";
import { getPublicUrl } from "~/lib/utils";

export const Route = createFileRoute("/blog/")({
  head: () => {
    const url = getPublicUrl("/blog");
    const desc =
      "Articles pédagogiques sur le foncier camerounais : titre foncier, certificat de propriété, immatriculation, lotissement et plus.";
    return {
      meta: [
        { title: "Blog · Osy-Immo" },
        { name: "description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:title", content: "Blog · Osy-Immo" },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Osy-Immo" },
        { property: "og:locale", content: "fr_CM" },
      ],
    };
  },
  component: BlogIndexPage,
});

function BlogIndexPage() {
  // Trie une copie locale par date décroissante. Sort en place le tableau d'origine
  // serait une mauvaise idée : il est partagé entre toutes les pages.
  const sorted = [...articles].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Blog" },
        ]}
      />
      {/* HERO --------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-100 via-brand-50 to-white" />
        <div className="mx-auto max-w-7xl px-6 pb-12 pt-16 sm:pt-20">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-200/50 px-3 py-1 text-xs font-medium text-brand-700">
              <BookOpen className="h-3.5 w-3.5" />
              Comprendre le foncier camerounais
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Le <span className="text-accent-500">blog Osy-Immo</span>
            </h1>
            <p className="mt-4 text-lg text-brand-700/80">
              Tout ce qu'il faut savoir avant d'acheter ou de vendre un bien au
              Cameroun. Articles pédagogiques rédigés pour les acheteurs, vendeurs
              et professionnels du secteur.
            </p>
          </div>
        </div>
      </section>

      {/* GRILLE ARTICLES --------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </section>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// ArticleCard : card cliquable d'aperçu d'article dans la grille
// -------------------------------------------------------------------------------------------------
function ArticleCard({ article }: { article: BlogArticleMeta }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: article.slug }}
      className="group block overflow-hidden rounded-[var(--radius-card)] bg-white shadow-soft transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-swift-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] active:scale-[0.99]"
    >
      {/* Image cover */}
      <div className="aspect-[16/9] w-full overflow-hidden bg-brand-100">
        <img
          src={article.coverImage}
          alt={article.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-[400ms] [transition-timing-function:var(--ease-swift-out)] group-hover:scale-[1.04]"
        />
      </div>

      <div className="p-5">
        {/* Tags */}
        {article.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <h2 className="line-clamp-2 text-lg font-semibold tracking-tight text-brand-900 group-hover:text-accent-500">
          {article.title}
        </h2>
        <p className="mt-2 line-clamp-3 text-sm text-brand-700/80">
          {article.excerpt}
        </p>

        {/* Meta */}
        <div className="mt-4 flex items-center gap-3 text-xs text-brand-700/60">
          <span>{formatDate(article.publishedAt)}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {article.readingTimeMin} min de lecture
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Format date "YYYY-MM-DD" → "17 mai 2026" (fr-CM)
 */
function formatDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("fr-CM", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
