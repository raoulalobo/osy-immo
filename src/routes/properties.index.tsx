// src/routes/properties.index.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Listing avec filtres `/properties`. Les filtres sont stockés dans l'URL (search params)
//        et validés par Zod via TanStack Router. Pagination par curseur avec bouton « Charger plus ».
//
// Interactions :
//  - usePaginatedQuery(api.properties.listPaginated, filters) suit en live les changements.
//  - usePaginatedQuery(api.properties.search, { q, ... }) si un terme de recherche est saisi.
//  - Le hook réinitialise sa pagination dès que la query OU les args changent → tout changement
//    de filtre dans l'URL (et la bascule recherche ↔ listing) repart de la première page.
// -------------------------------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { Breadcrumb } from "~/components/Breadcrumb";
import { PropertyCard } from "~/components/PropertyCard";
import { SearchBar } from "~/components/SearchBar";

// Schéma de validation des query params via Zod
const searchSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  listingType: z.enum(["sale", "rent"]).optional(),
  type: z.enum(["apartment", "house", "land", "commercial"]).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minSurface: z.coerce.number().optional(),
});

// Taille de page : 12 = multiple de 6 → remplit exactement la grille en
// 2 colonnes (tablette, 6 lignes) comme en 3 colonnes (desktop, 4 lignes).
const PAGE_SIZE = 12;

export const Route = createFileRoute("/properties/")({
  validateSearch: searchSchema,
  component: PropertiesListPage,
});

function PropertiesListPage() {
  const filters = Route.useSearch();
  const hasSearchQuery = Boolean(filters.q && filters.q.trim().length > 0);

  // Recherche full-text si q présent, sinon listing filtré — les deux paginés
  // par curseur. Un seul hook suffit : usePaginatedQuery réinitialise son état
  // dès que la référence de fonction ou les args changent.
  const { results, status, loadMore } = usePaginatedQuery(
    hasSearchQuery ? api.properties.search : api.properties.listPaginated,
    hasSearchQuery
      ? {
          q: filters.q!,
          city: filters.city,
          type: filters.type,
          listingType: filters.listingType,
        }
      : {
          city: filters.city,
          type: filters.type,
          listingType: filters.listingType,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          minSurface: filters.minSurface,
        },
    { initialNumItems: PAGE_SIZE }
  );

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Annonces" },
        ]}
      />
      <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Annonces</h1>
        <SearchBar initial={filters} />
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-72 shimmer rounded-[var(--radius-card)]"
            />
          ))}
        </div>
      ) : results.length === 0 && status === "Exhausted" ? (
        // « Aucun résultat » seulement quand la pagination est épuisée : avec
        // des filtres serrés (appliqués en mémoire côté serveur), une page
        // peut être vide alors qu'il reste des annonces à parcourir — dans ce
        // cas on garde le bouton « Charger plus » visible ci-dessous.
        <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center">
          <p className="font-medium">Aucun résultat</p>
          <p className="mt-2 text-sm text-brand-700/70">
            Essayez d'élargir vos critères de recherche.
          </p>
        </div>
      ) : (
        <>
          {/* Total exact seulement à épuisement ; sinon, compteur de cartes chargées. */}
          <p className="mb-4 text-sm text-brand-700/70">
            {status === "Exhausted"
              ? `${results.length} annonce${results.length > 1 ? "s" : ""} trouvée${results.length > 1 ? "s" : ""}`
              : `${results.length} annonce${results.length > 1 ? "s" : ""} affichée${results.length > 1 ? "s" : ""}`}
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <PropertyCard key={p._id} property={p} />
            ))}
          </div>
          {(status === "CanLoadMore" || status === "LoadingMore") && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => loadMore(PAGE_SIZE)}
                disabled={status === "LoadingMore"}
                className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "LoadingMore"
                  ? "Chargement…"
                  : "Charger plus d'annonces"}
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </>
  );
}
