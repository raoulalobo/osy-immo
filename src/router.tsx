// src/router.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Crée et exporte l'instance du TanStack Router utilisée par TanStack Start
//        (côté client ET serveur).
//        TanStack Start 1.168+ attend une fonction nommée `getRouter` (sync ou async) — c'est
//        cette fonction que le serveur appelle pour obtenir le router à chaque requête.
//
//        On y branche également le client Convex sur le contexte du router, afin que les
//        loaders puissent appeler `context.convex.query(...)`.
//
// Interactions :
//  - Importé par TanStack Start (entrée auto-résolue : `src/router.{ts,tsx}`).
//  - `src/routeTree.gen.ts` est régénéré à chaque modif des fichiers `src/routes/`.
//
// Exemple d'usage dans une route :
//   export const Route = createFileRoute('/properties/')({
//     loader: ({ context: { convex } }) => convex.query(api.properties.list, {}),
//   });
// -------------------------------------------------------------------------------------------------

import { createRouter } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { routeTree } from "./routeTree.gen";

// URL HTTPS du déploiement Convex (renseignée par `npx convex dev`)
const CONVEX_URL =
  (import.meta as any).env?.VITE_CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? "";

if (!CONVEX_URL) {
  // Avertit en dev mais ne bloque pas le rendu d'erreur amical
  console.warn(
    "[router] VITE_CONVEX_URL n'est pas défini. Exécute `pnpm convex:dev` pour le créer."
  );
}

/**
 * Fabrique le router TanStack pour Start.
 * NOTE : Le nom `getRouter` est imposé par TanStack Start (le serveur fait
 * `entries.routerEntry.getRouter()` à chaque requête).
 */
export function getRouter() {
  // Client Convex partagé — alimente <ConvexProvider/> et les hooks `useQuery`.
  const convex = new ConvexReactClient(CONVEX_URL, {
    unsavedChangesWarning: false,
  });

  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    context: { convex },
    scrollRestoration: true,
  });

  return router;
}
