// src/components/Skeletons.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Composants skeleton réutilisés par plusieurs routes pendant les
//        phases de chargement (session Better Auth en cours, query Convex en
//        attente, etc.). Remplacent les anciens textes "Chargement…" par des
//        placeholders qui miment la structure réelle qui apparaîtra ensuite —
//        élimine le flash + le CLS (Cumulative Layout Shift).
//
// Implémentation : tous les blocs utilisent la classe utilitaire CSS `.shimmer`
// (définie dans src/styles.css). Cette classe :
//   - applique un fond gris bleu (bg-brand-100) avec un balayage clair animé
//   - respecte automatiquement `prefers-reduced-motion: reduce` (animation
//     coupée, fond statique conservé)
//
// Pourquoi un fichier centralisé plutôt que des composants locaux :
//   - FormSkeleton est réutilisé par 2 routes (dashboard.new + dashboard.edit)
//   - ThreadSkeleton est utilisé 2× dans dashboard.messages.$id (auth pending + thread loading)
//   - DashboardSkeleton est spécifique à dashboard.index mais factorisé pour clarté
//
// Autres skeletons restent locaux à leur route (`ConversationListSkeleton`
// dans dashboard.messages.index.tsx, le skeleton stats dans dashboard.stats.$id.tsx)
// car ils ne sont pas partagés.
// -------------------------------------------------------------------------------------------------

import { cn } from "~/lib/utils";

/**
 * Skeleton du formulaire d'annonce — utilisé par :
 *   - /dashboard/new pendant la résolution de session
 *   - /dashboard/edit/:id pendant la résolution de session OU le fetch de la propriété
 *
 * Mime la structure : titre, paragraphe d'intro, carte blanche contenant 8 blocs
 * label+input et un bouton submit. Le nombre 8 correspond aux champs principaux
 * affichés par PropertyForm (Titre, Description, Type+Transaction+Prix, Surface+Pièces+Chambres,
 * Salles+Année+Énergie, Adresse, Ville+Région, Pays+CP, GPS, Médias, Équipements).
 */
export function FormSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="h-8 w-64 max-w-full shimmer rounded" />
      <div className="mt-2 h-4 w-96 max-w-full shimmer rounded" />
      <div className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow-soft">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-32 shimmer rounded" />
            <div className="h-10 w-full shimmer rounded-lg" />
          </div>
        ))}
        {/* Bouton submit final */}
        <div className="h-12 w-full shimmer rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Skeleton d'une conversation (fil de messages) — utilisé par
 * /dashboard/messages/:id pour le cas auth pending ET le cas thread loading.
 *
 * Mime la structure : en-tête annonce (vignette + titre + sous-titre) + 5 bulles
 * de message alternées gauche/droite, largeur variable pour un rendu organique.
 */
export function ThreadSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Header annonce — vignette image + titre + sous-titre */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 shimmer rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 max-w-full shimmer rounded" />
          <div className="h-3 w-24 shimmer rounded" />
        </div>
      </div>
      {/* 5 bulles alternées — pattern visuel "conversation" */}
      <div className="space-y-3">
        {[true, false, true, false, true].map((alignLeft, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              alignLeft ? "justify-start" : "justify-end"
            )}
          >
            <div
              className={cn(
                "h-12 shimmer rounded-2xl",
                // Largeurs variables pour un rendu naturel (pas trop uniforme)
                i % 3 === 0
                  ? "w-1/2"
                  : i % 3 === 1
                    ? "w-1/3"
                    : "w-2/5"
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton de la page dashboard — utilisé par /dashboard pendant la résolution
 * de session Better Auth (cas isPending === true).
 *
 * Mime la structure réelle : titre + sous-titre + bouton CTA, 3 KPI cards,
 * et la section "Mes annonces" avec 5 lignes de table.
 *
 * Volontairement compact : la page chargera ensuite la version complète avec
 * la section "Demandes reçues" en bas, mais le skeleton ne mime que le 1er fold
 * pour économiser des allocations DOM inutiles.
 */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* En-tête : titre/sous-titre à gauche + CTA "Publier" à droite */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-8 w-48 max-w-full shimmer rounded" />
          <div className="h-4 w-64 max-w-full shimmer rounded" />
        </div>
        <div className="h-10 w-44 shrink-0 shimmer rounded-full" />
      </div>
      {/* 3 KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 shimmer rounded-2xl" />
        ))}
      </div>
      {/* Titre de section + 5 lignes table */}
      <div className="mt-10">
        <div className="h-6 w-40 shimmer rounded" />
        <div className="mt-4 rounded-2xl bg-white p-2 shadow-soft">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="my-1 h-14 shimmer rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
