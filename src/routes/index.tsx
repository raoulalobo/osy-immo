// src/routes/index.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Page d'accueil — hero, barre de recherche, sélection d'annonces récentes,
//        et catégories rapides.
//
// Interactions :
//  - useQuery(api.properties.list, { limit: 6 }) en client side rendering (réactif).
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  Clock,
  Home as HomeIcon,
  Store,
  TreePine,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { CarouselDots } from "~/components/CarouselDots";
import { PropertyCard } from "~/components/PropertyCard";
import { SearchBar } from "~/components/SearchBar";
import { pickArticlesByDate } from "~/content/blog";

// Schéma des query params acceptés sur la home.
// `error` est posé par Better Auth quand un callback OAuth échoue (ex.
// `account_not_linked` quand on tente Google avec un email déjà inscrit
// en email/password sans linking activé). On le capture pour afficher
// un toast clair plutôt que de laisser l'utilisateur perdu.
const homeSearchSchema = z.object({
  error: z.string().optional(),
});

// Mapping des codes d'erreur Better Auth → message FR utilisateur.
// Tout code non listé tombe en générique.
const ERROR_MESSAGES: Record<string, string> = {
  account_not_linked:
    "Un compte avec cet email existe déjà. Connectez-vous via email/mot de passe puis liez Google depuis votre espace.",
  unable_to_create_user:
    "Impossible de créer le compte. Réessayez ou utilisez l'inscription par email.",
  email_not_verified:
    "Votre adresse Google n'est pas vérifiée. Utilisez un compte Google avec email confirmé.",
};

export const Route = createFileRoute("/")({
  validateSearch: homeSearchSchema,
  component: HomePage,
});

function HomePage() {
  const recent = useQuery(api.properties.list, { limit: 6 });
  const { error } = Route.useSearch();
  const navigate = useNavigate();

  // Affiche un toast si on revient ici avec ?error=... (callback OAuth qui a
  // échoué côté Better Auth). On nettoie l'URL après pour éviter de re-toaster
  // au refresh — `navigate` sans search retire le paramètre proprement.
  useEffect(() => {
    if (!error) return;
    const message = ERROR_MESSAGES[error] ?? `Erreur de connexion : ${error}`;
    toast.error(message);
    // Nettoie l'URL (retire le query param error sans recharger la page)
    void navigate({ to: "/", search: {}, replace: true });
  }, [error, navigate]);
  // Ref du conteneur scrollable du carrousel "Annonces récentes". Utilisée par
  // <CarouselDots> pour observer les slides via IntersectionObserver et
  // déclencher `scrollIntoView` au tap sur un dot.
  const recentRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      {/* HERO -------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-100 via-brand-50 to-white" />
        <div className="mx-auto max-w-7xl px-6 pb-16 pt-20 sm:pt-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-700 shadow-soft">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-500" />
              Marketplace immobilier · Cameroun
            </span>
            {/* Typo plus assumée : leading-[0.95] pour serrer les lignes, tracking
                négatif pour resserrer les caractères (Display-grade), font-weight
                semi-bold (pas bold — moins agressif). */}
            <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
              Trouvez votre{" "}
              <span className="text-accent-500">prochain chez‑vous</span>.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-brand-700/80 leading-relaxed">
              Appartements, maisons, terrains et locaux commerciaux dans les grandes
              villes du Cameroun. Filtrez par ville, budget, surface — et contactez
              directement le propriétaire.
            </p>
            <div className="mt-8 max-w-3xl">
              <SearchBar />
            </div>

            {/* Catégories ----------------------------------------- */}
            <div className="mt-6 flex flex-wrap gap-2">
              <CategoryChip to="/properties" type="apartment" icon={<Building2 className="h-4 w-4" />} label="Appartements" />
              <CategoryChip to="/properties" type="house" icon={<HomeIcon className="h-4 w-4" />} label="Maisons" />
              <CategoryChip to="/properties" type="land" icon={<TreePine className="h-4 w-4" />} label="Terrains" />
              <CategoryChip to="/properties" type="commercial" icon={<Store className="h-4 w-4" />} label="Commerciaux" />
            </div>
          </div>
        </div>
      </section>

      {/* ANNONCES RÉCENTES ----------------------------------------- */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Annonces récentes</h2>
            <p className="text-sm text-brand-700/70">
              Sélection en temps réel — les dernières propriétés publiées.
            </p>
          </div>
          {/* Lien header — caché sur mobile (remplacé par un bouton plein
              largeur sous le carrousel pour libérer la place du titre). */}
          <Link
            to="/properties"
            className="hidden text-sm font-medium text-brand-700 hover:text-accent-500 sm:inline-block"
          >
            Tout voir →
          </Link>
        </div>

        {recent === undefined ? (
          <PropertyGridSkeleton />
        ) : recent.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Mobile (<sm) : carrousel horizontal scroll-snap (scrollbar cachée
                via .scrollbar-hide, progression indiquée par les dots ci-dessous).
                - `-mx-6 px-6` étend le carrousel jusqu'aux bords du viewport tout
                  en gardant un padding visuel (le user voit clairement le bord).
                - `w-[85%]` par card : la card suivante "peek" à 15 % à droite,
                  indiquant visuellement qu'il y a plus de contenu à droite.
                - `snap-x snap-mandatory` + `snap-start` = scroll qui s'arrête
                  net sur chaque card (feel "swipe natif").
                Tablet+ (sm:) : grid classique 2/3 cols, comportement inchangé. */}
            <div
              ref={recentRef}
              className="scrollbar-hide -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3"
            >
              {recent.map((p) => (
                <div
                  key={p._id}
                  className="w-[85%] shrink-0 snap-start sm:w-auto"
                >
                  <PropertyCard property={p} />
                </div>
              ))}
            </div>

            {/* Dots cliquables sous le carrousel — mobile only.
                Active dot = pill rouge accent, autres = points gris brand-200. */}
            <CarouselDots
              containerRef={recentRef}
              count={recent.length}
              className="sm:hidden"
            />

            {/* CTA plein largeur "Voir toutes les annonces" — mobile only.
                Remplace le lien header compressé. Pattern Airbnb/Le Bon Coin. */}
            <Link
              to="/properties"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 active:scale-[0.98] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] sm:hidden"
            >
              Voir toutes les annonces
              <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        )}
      </section>

      {/* SECTION BLOG -----------------------------------------------------
         Sélection de 3 articles par jour, stable côté SSR/CSR pour éviter
         tout mismatch d'hydratation. Aucune requête réseau : tout est en-bundle. */}
      <BlogTeaser />
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// BlogTeaser : 3 articles tirés au hasard (rotation quotidienne) en bas de la home.
// Coût runtime : <1 ms (pas de fetch, pas de query Convex — tout est statique TS).
// -------------------------------------------------------------------------------------------------
function BlogTeaser() {
  const picks = pickArticlesByDate(3);
  // Ref du carrousel des articles — même rôle que `recentRef` ci-dessus.
  const blogRef = useRef<HTMLDivElement>(null);

  return (
    <section className="border-t border-brand-200/60 bg-brand-50/40">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-200/50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
              <BookOpen className="h-3 w-3" />
              Blog
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Comprendre avant d'acheter
            </h2>
            <p className="text-sm text-brand-700/70">
              Articles pédagogiques sur le foncier camerounais — titre foncier,
              immatriculation, lotissement, etc.
            </p>
          </div>
          {/* Lien header — caché sur mobile (remplacé par bouton plein largeur). */}
          <Link
            to="/blog"
            className="hidden text-sm font-medium text-brand-700 hover:text-accent-500 sm:inline-block"
          >
            Tous les articles →
          </Link>
        </div>

        {/* Même pattern responsive que la section "Annonces récentes" :
            carrousel scroll-snap horizontal sur mobile + dots + CTA bas plein
            largeur ; grid 2/3 cols dès `sm`. */}
        <div
          ref={blogRef}
          className="scrollbar-hide -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3"
        >
          {picks.map((article) => (
            <Link
              key={article.slug}
              to="/blog/$slug"
              params={{ slug: article.slug }}
              className="group block w-[85%] shrink-0 snap-start overflow-hidden rounded-[var(--radius-card)] bg-white shadow-soft transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-swift-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] active:scale-[0.99] sm:w-auto"
            >
              <div className="aspect-[16/9] w-full overflow-hidden bg-brand-100">
                <img
                  src={article.coverImage}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[400ms] [transition-timing-function:var(--ease-swift-out)] group-hover:scale-[1.04]"
                />
              </div>
              <div className="p-4">
                {article.tags.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700">
                    {article.tags[0]}
                  </span>
                )}
                <h3 className="mt-2 line-clamp-2 text-base font-semibold tracking-tight text-brand-900 group-hover:text-accent-500">
                  {article.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-brand-700/80">
                  {article.excerpt}
                </p>
                <p className="mt-3 inline-flex items-center gap-1 text-xs text-brand-700/60">
                  <Clock className="h-3 w-3" />
                  {article.readingTimeMin} min de lecture
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Dots cliquables sous le carrousel blog — mobile only. */}
        <CarouselDots
          containerRef={blogRef}
          count={picks.length}
          className="sm:hidden"
        />

        {/* CTA plein largeur "Lire tous les articles" — mobile only. */}
        <Link
          to="/blog"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 active:scale-[0.98] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] sm:hidden"
        >
          Lire tous les articles
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function CategoryChip({
  to,
  type,
  icon,
  label,
}: {
  to: "/properties";
  type: "apartment" | "house" | "land" | "commercial";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      search={{ type } as any}
      className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
    >
      {icon}
      {label}
    </Link>
  );
}

function PropertyGridSkeleton() {
  // Même responsive que la grille réelle pour éviter le "saut" visuel à
  // l'hydratation : carrousel mobile (scrollbar cachée), grille tablet+.
  return (
    <div className="scrollbar-hide -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-72 w-[85%] shrink-0 snap-start shimmer rounded-[var(--radius-card)] sm:w-auto"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center">
      <p className="font-medium">Aucune annonce active pour l'instant.</p>
      <p className="mt-2 text-sm text-brand-700/70">
        Démarrez Convex (`pnpm convex:dev`) puis seedez les données (`pnpm seed`).
      </p>
    </div>
  );
}
