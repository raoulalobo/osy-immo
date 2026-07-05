// src/components/SearchBar.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Formulaire de recherche compact — ville, type de transaction, type de bien.
//        Met à jour les `searchParams` de la route `/properties` via TanStack Router.
//
// Interactions :
//  - Lit/écrit les search params via `useSearch` + `useNavigate`.
//  - Les params sont validés par Zod côté route.
//  - Les `<select>` natifs ont été remplacés par le composant custom <Select>
//    pour éviter le menu OS non stylable et garantir la cohérence design.
// -------------------------------------------------------------------------------------------------

import { useNavigate } from "@tanstack/react-router";
import {
  Building2,
  Home as HomeIcon,
  Search,
  Store,
  Tag,
  TreePine,
} from "lucide-react";
import { useState } from "react";
import { Select, type SelectOption } from "~/components/Select";

export type PropertyFilters = {
  city?: string;
  listingType?: "sale" | "rent";
  type?: "apartment" | "house" | "land" | "commercial";
  minPrice?: number;
  maxPrice?: number;
  q?: string;
  // Filtres modalités de paiement — true = « uniquement les annonces qui
  // proposent la modalité ». En pratique jamais false : la clé est supprimée
  // (undefined) quand la case est décochée, pour garder l'URL propre.
  acceptsInstallments?: boolean;
  acceptsExchange?: boolean;
};

// Options listingType — vide = "Tous types de transactions"
const LISTING_TYPE_OPTIONS: SelectOption<"sale" | "rent">[] = [
  { value: "sale", label: "Achat", icon: <Tag className="h-3.5 w-3.5" /> },
  { value: "rent", label: "Location", icon: <Tag className="h-3.5 w-3.5" /> },
];

// Options type de bien — icônes lucide pour repère visuel
const PROPERTY_TYPE_OPTIONS: SelectOption<
  "apartment" | "house" | "land" | "commercial"
>[] = [
  {
    value: "apartment",
    label: "Appartement",
    icon: <Building2 className="h-3.5 w-3.5" />,
  },
  {
    value: "house",
    label: "Maison",
    icon: <HomeIcon className="h-3.5 w-3.5" />,
  },
  {
    value: "land",
    label: "Terrain",
    icon: <TreePine className="h-3.5 w-3.5" />,
  },
  {
    value: "commercial",
    label: "Commercial",
    icon: <Store className="h-3.5 w-3.5" />,
  },
];

export function SearchBar({
  initial,
  redirectTo = "/properties",
}: {
  initial?: PropertyFilters;
  redirectTo?: "/properties" | "/";
}) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<PropertyFilters>(initial ?? {});

  function update<K extends keyof PropertyFilters>(
    key: K,
    value: PropertyFilters[K] | undefined
  ) {
    setFilters((f) => ({
      ...f,
      [key]: value,
    }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void navigate({
          to: redirectTo,
          search: filters as any,
        });
      }}
      className="grid grid-cols-1 gap-2 rounded-2xl bg-white p-2 shadow-soft sm:grid-cols-[1fr,160px,160px,auto]"
    >
      <input
        type="text"
        placeholder="Ville, quartier, mot-clé…"
        value={filters.q ?? filters.city ?? ""}
        onChange={(e) =>
          update("q", e.target.value === "" ? undefined : e.target.value)
        }
        className="rounded-xl bg-brand-50 px-4 py-3 text-sm outline-none placeholder:text-brand-700/50 focus:ring-2 focus:ring-brand-500"
      />

      <Select
        value={filters.listingType ?? ""}
        onChange={(v) => update("listingType", v)}
        options={LISTING_TYPE_OPTIONS}
        placeholder="Achat / Location"
        ariaLabel="Type de transaction"
      />

      <Select
        value={filters.type ?? ""}
        onChange={(v) => update("type", v)}
        options={PROPERTY_TYPE_OPTIONS}
        placeholder="Tous types"
        ariaLabel="Type de bien"
      />

      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-5 py-3 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
      >
        <Search className="h-4 w-4" /> Rechercher
      </button>

      {/* Filtres modalités de paiement — rangée pleine largeur sous les
          champs principaux (col-span-4 = toutes les colonnes de la grille).
          Cochée → clé à true dans les filtres ; décochée → clé supprimée
          (undefined) pour ne pas polluer l'URL. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 pb-1 sm:col-span-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-700">
          <input
            type="checkbox"
            checked={filters.acceptsInstallments ?? false}
            onChange={(e) =>
              update(
                "acceptsInstallments",
                e.target.checked ? true : undefined
              )
            }
            className="h-4 w-4 rounded border-brand-300 text-accent-500 focus:ring-accent-500"
          />
          Paiement en tranches
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-700">
          <input
            type="checkbox"
            checked={filters.acceptsExchange ?? false}
            onChange={(e) =>
              update("acceptsExchange", e.target.checked ? true : undefined)
            }
            className="h-4 w-4 rounded border-brand-300 text-accent-500 focus:ring-accent-500"
          />
          Échange accepté
        </label>
      </div>
    </form>
  );
}
