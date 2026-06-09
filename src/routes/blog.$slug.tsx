// src/routes/blog.$slug.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Page détail d'un article du blog `/blog/<slug>`.
//
//        Le contenu de l'article est un composant React stocké dans
//        `src/content/blog/<slug>.tsx` et référencé par `articleComponents`.
//
// SEO :
//   - `loader` : retrouve la metadata via getArticleMeta() — throw notFound() si inconnu.
//   - `head({ loaderData })` : meta OG dynamiques pour partage WhatsApp / FB / X.
//     `og:type=article` (au lieu de website) + tags article:published_time / article:tag.
//   - Bonus : JSON-LD Article schema.org injecté dans le head pour Google Rich Results.
//
// Reuse :
//   - Loader pattern issu de `properties.$id.tsx` (notFound, head dynamique).
//   - `Prose` wrapper pour la typographie cohérente.
//   - `getPublicUrl` / `getRelatedArticles` du content/blog/index.ts.
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Clock, Info } from "lucide-react";
import { Breadcrumb, BreadcrumbJsonLd } from "~/components/Breadcrumb";
import { Prose } from "~/components/Prose";
import {
  articleComponents,
  getArticleMeta,
  getRelatedArticles,
} from "~/content/blog";
import { getPublicUrl } from "~/lib/utils";

export const Route = createFileRoute("/blog/$slug")({
  // ----- Loader : résolution synchrone (pas de Convex pour le blog) ----------
  // Le slug est validé contre le registre TypeScript. Si inconnu, on throw
  // notFound() — TanStack rendra alors `notFoundComponent` ci-dessous.
  loader: ({ params }) => {
    const meta = getArticleMeta(params.slug);
    if (!meta) throw notFound();
    return { meta };
  },

  // ----- Meta dynamiques SSR (essentiel pour le partage social) -------------
  head: ({ loaderData }) => {
    if (!loaderData?.meta) return { meta: [] };
    const { meta } = loaderData;
    const url = getPublicUrl(`/blog/${meta.slug}`);
    const pageTitle = `${meta.title} · Blog Osy-Immo`;
    // Facebook, Twitter et autres bots sociaux exigent une URL ABSOLUE en og:image.
    // Pour les images locales servies via /public (ex: "/blog/titre-foncier.webp"),
    // on préfixe avec l'origine publique. Pour les URLs déjà absolues (Unsplash),
    // on les laisse telles quelles.
    const coverImageUrl = meta.coverImage.startsWith("http")
      ? meta.coverImage
      : getPublicUrl(meta.coverImage);
    // Détecte le mime type selon l'extension — WebP exige "image/webp" pour que
    // Facebook le prévisualise correctement (sinon fallback texte).
    const coverImageType = meta.coverImage.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: meta.excerpt },
        // og:type "article" pour signaler aux crawlers que c'est du contenu éditorial
        { property: "og:type", content: "article" },
        { property: "og:title", content: meta.title },
        { property: "og:description", content: meta.excerpt },
        { property: "og:image", content: coverImageUrl },
        { property: "og:image:secure_url", content: coverImageUrl },
        { property: "og:image:type", content: coverImageType },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: meta.title },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Osy-Immo" },
        { property: "og:locale", content: "fr_CM" },
        // Specs Open Graph "article"
        { property: "article:published_time", content: meta.publishedAt },
        ...meta.tags.map((tag) => ({
          property: "article:tag" as const,
          content: tag,
        })),
        // Twitter Card
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: meta.title },
        { name: "twitter:description", content: meta.excerpt },
        { name: "twitter:image", content: coverImageUrl },
      ],
    };
  },

  // ----- Page Not Found (slug inconnu) --------------------------------------
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Article introuvable</h1>
      <p className="mt-2 text-brand-700/70">
        Cet article n'existe pas (peut-être un mauvais lien ?).
      </p>
      <Link
        to="/blog"
        className="mt-6 inline-block rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
      >
        Retour au blog
      </Link>
    </div>
  ),

  component: BlogArticlePage,
});

function BlogArticlePage() {
  const { slug } = Route.useParams();
  const { meta } = Route.useLoaderData();
  // Récupère le composant React qui rend le corps de l'article
  const ArticleBody = articleComponents[slug];
  // Pour le maillage interne et la rétention
  const related = getRelatedArticles(slug, 3);

  // Garde-fou de typage : si notre registre est désynchronisé (article meta
  // existe mais pas le composant), on rend un message clair plutôt qu'écran blanc.
  if (!ArticleBody) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Contenu non disponible</h1>
        <p className="mt-2 text-brand-700/70">
          L'article existe mais son contenu n'a pas pu être chargé. Réessaie plus tard.
        </p>
      </div>
    );
  }

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Blog", to: "/blog" },
          { label: meta.title, title: meta.title },
        ]}
      />
      {/* JSON-LD BreadcrumbList — rich snippets Google sur les articles blog */}
      <BreadcrumbJsonLd
        items={[
          { label: "Accueil", url: getPublicUrl("/") },
          { label: "Blog", url: getPublicUrl("/blog") },
          { label: meta.title },
        ]}
      />
      <article className="mx-auto max-w-3xl px-6 py-10">
      {/* Lien retour */}
      <Link
        to="/blog"
        className="inline-flex items-center gap-1 text-sm text-brand-700/70 hover:text-accent-500"
      >
        <ArrowLeft className="h-4 w-4" /> Tous les articles
      </Link>

      {/* En-tête */}
      <header className="mt-4">
        <div className="flex flex-wrap gap-1.5">
          {meta.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-700"
            >
              {tag}
            </span>
          ))}
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {meta.title}
        </h1>
        <p className="mt-2 text-lg text-brand-700/70">{meta.excerpt}</p>
        <div className="mt-4 flex items-center gap-3 text-xs text-brand-700/60">
          <span>{formatDate(meta.publishedAt)}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {meta.readingTimeMin} min de lecture
          </span>
        </div>
      </header>

      {/* Image hero */}
      <div className="mt-6 overflow-hidden rounded-2xl bg-brand-100">
        <img
          src={meta.coverImage}
          alt=""
          className="aspect-[16/9] w-full object-cover"
        />
      </div>

      {/* Corps de l'article via Prose pour les styles typographiques */}
      <div className="mt-10">
        <Prose>
          <ArticleBody />
        </Prose>
      </div>

      {/* Disclaimer juridique — obligatoire en bas de chaque article */}
      <aside className="mt-12 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            <strong>Avertissement légal.</strong> Cet article est fourni à titre
            d'information générale et ne constitue pas un conseil juridique. Pour
            toute décision relative à une transaction immobilière au Cameroun,
            consultez un notaire, un avocat ou un expert foncier habilité.
          </p>
        </div>
      </aside>

      {/* Articles connexes */}
      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">
            Articles connexes
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  to="/blog/$slug"
                  params={{ slug: r.slug }}
                  className="group block overflow-hidden rounded-xl bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="aspect-[16/9] w-full overflow-hidden bg-brand-100">
                    <img
                      src={r.coverImage}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-medium text-brand-900 group-hover:text-accent-500">
                      {r.title}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* CTA retour vers les annonces — le but est de convertir le lecteur */}
      <section className="mt-12 rounded-2xl bg-brand-500 p-6 text-white">
        <h2 className="text-xl font-semibold">Prêt à passer à l'action ?</h2>
        <p className="mt-1 text-white/85">
          Parcourez les annonces immobilières disponibles au Cameroun et trouvez
          votre prochain bien en quelques clics.
        </p>
        <Link
          to="/properties"
          className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          Voir les annonces
        </Link>
      </section>
      </article>
    </>
  );
}

/** Format ISO date "YYYY-MM-DD" → "17 mai 2026" (locale fr-CM) */
function formatDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("fr-CM", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
