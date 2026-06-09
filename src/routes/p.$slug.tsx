// src/routes/p.$slug.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Redirection courte `/p/<slug>` → `/properties/<id>`.
//
//        Sert à partager une annonce sur TikTok (et autres plateformes
//        contraintes en longueur). Le slug est généré à la création de
//        l'annonce dans convex/properties.ts (6 chars random).
//
//        Exemple : `osy-immo.com/p/k3m7p2` → `osy-immo.com/properties/jd75snq1...`
//
// Comportement :
//   - Loader SSR : appelle `properties.getByShortSlug` pour résoudre le propertyId
//   - Si introuvable → `notFound()` (page 404 standard du router)
//   - Sinon, le component effectue un `navigate({ replace: true })` côté client
//     dès le mount → l'utilisateur ne voit pas le slug dans l'historique
//
// Note SEO :
//   Une vraie redirection 301 côté serveur serait idéale pour le crawl Google
//   (transmission de juice SEO). TanStack Start ne l'expose pas trivialement
//   pour les routes file-based — le redirect client suffit pour l'usage TikTok
//   (clic humain, pas crawl Google qui visiterait /p/* en masse). À revoir
//   plus tard si on indexe les short-URLs (peu probable, elles ne sont pas
//   sitemap-ées).
// -------------------------------------------------------------------------------------------------

import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/p/$slug")({
  // Loader SSR — résout le slug via Convex query. Throw notFound() si
  // le slug n'existe pas (annonce supprimée, mauvais lien).
  loader: async ({ context: { convex }, params }) => {
    const result = await convex.query(api.properties.getByShortSlug, {
      slug: params.slug,
    });
    if (!result) throw notFound();
    return result;
  },
  // Pas de head() spécifique — la fiche destination /properties/$id porte
  // ses propres meta tags Open Graph. Pour TikTok/WhatsApp qui voient un
  // partage de /p/<slug> directement, ils suivront le redirect et lisent
  // les meta de la fiche finale.
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl p-10 text-center">
      <h1 className="text-2xl font-semibold">Lien introuvable</h1>
      <p className="mt-2 text-brand-700/70">
        Ce lien court n'existe pas ou l'annonce a été supprimée.
      </p>
    </div>
  ),
  component: ShortSlugRedirect,
});

function ShortSlugRedirect() {
  const { propertyId } = Route.useLoaderData();
  const navigate = useNavigate();

  // Redirection côté client dès le mount. `replace: true` évite que
  // l'utilisateur revienne sur `/p/<slug>` en faisant Back — il reviendra
  // directement à la page précédente (TikTok, profil utilisateur, etc.).
  useEffect(() => {
    void navigate({
      to: "/properties/$id",
      params: { id: propertyId as Id<"properties"> },
      replace: true,
    });
  }, [propertyId, navigate]);

  // Petit écran de chargement pendant les ~100-200 ms de redirection.
  // Affiché en SSR et côté client jusqu'à ce que navigate() prenne effet.
  return (
    <div className="mx-auto max-w-2xl p-10 text-center text-brand-700/70">
      Redirection en cours…
    </div>
  );
}
