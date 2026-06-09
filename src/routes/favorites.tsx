// src/routes/favorites.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Page favoris — protégée. Redirige vers /auth/login si non connecté.
//        Affiche les annonces que l'utilisateur a ajoutées à ses favoris.
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { Breadcrumb } from "~/components/Breadcrumb";
import { PropertyCard } from "~/components/PropertyCard";
import { authClient } from "~/lib/auth-client";

export const Route = createFileRoute("/favorites")({
  component: FavoritesPage,
});

function FavoritesPage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const favorites = useQuery(api.favorites.listMine, session ? {} : "skip");

  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: "/auth/login" });
    }
  }, [isPending, session, navigate]);

  // Skeleton de page pendant la résolution BetterAuth — titre + sous-titre +
  // grille 3 cards shimmer (cohérent avec le skeleton de la query plus bas).
  if (isPending) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="h-8 w-40 shimmer rounded" />
        <div className="mt-2 h-4 w-96 max-w-full shimmer rounded" />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-72 shimmer rounded-[var(--radius-card)]"
            />
          ))}
        </div>
      </div>
    );
  }
  if (!session) return null;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Mes favoris" },
        ]}
      />
      <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Mes favoris</h1>
      <p className="mt-1 text-brand-700/70">
        Retrouvez ici les annonces que vous avez sauvegardées.
      </p>

      {favorites === undefined ? (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-72 shimmer rounded-[var(--radius-card)]"
            />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center">
          <p className="font-medium">Aucun favori pour l'instant.</p>
          <Link
            to="/properties"
            className="mt-4 inline-block rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
          >
            Parcourir les annonces
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map(
            (entry) =>
              entry && (
                <PropertyCard key={entry.favoriteId} property={entry.property} />
              )
          )}
        </div>
      )}
      </div>
    </>
  );
}
