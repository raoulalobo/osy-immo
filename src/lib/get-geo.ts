// src/lib/get-geo.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Lit la géolocalisation approximative injectée par l'edge Vercel sur chaque requête.
//
// Implémentation isomorphique :
//   - Côté SERVEUR : lit les headers `x-vercel-ip-country / city / region`.
//   - Côté CLIENT  : retourne `{}` (les headers de requête ne sont pas dispos).
//
// Pourquoi `createIsomorphicFn` :
//   TanStack Start bloque les imports server-only depuis des fichiers chargés par
//   le router (loaders). On ne peut donc pas faire `await import("...server")`
//   conditionnellement. Cette API officielle de TanStack résout le problème :
//   le runtime swappe l'implémentation client / server au build, et les modules
//   server-only ne fuient pas dans le bundle client.
//
// Headers Vercel utilisés : https://vercel.com/docs/edge-network/headers#x-vercel-ip-*
// -------------------------------------------------------------------------------------------------

import { createIsomorphicFn } from "@tanstack/react-start";
// Import statique : TanStack Start's import-protection-plugin sait que ce
// module est utilisé uniquement dans la branche `.server(...)` de
// `createIsomorphicFn`, et le supprime du bundle client.
import { getRequestHeaders } from "@tanstack/react-start/server";

export interface VercelGeo {
  country?: string;
  city?: string;
  region?: string;
}

/**
 * Retourne la géo Vercel — implémentation différente selon l'environnement.
 *
 * À appeler depuis un loader TanStack. Côté SSR remonte le pays/ville depuis
 * les headers Vercel. Côté SPA (navigation client après hydratation) retourne
 * `{}` — c'est cohérent car on n'a pas accès aux headers de la requête initiale.
 */
export const getVercelGeo = createIsomorphicFn()
  .client((): VercelGeo => ({}))
  .server((): VercelGeo => {
    try {
      const h = getRequestHeaders();
      return {
        country: h.get("x-vercel-ip-country") ?? undefined,
        city: h.get("x-vercel-ip-city")
          ? decodeURIComponent(h.get("x-vercel-ip-city")!)
          : undefined,
        region: h.get("x-vercel-ip-country-region") ?? undefined,
      };
    } catch {
      // Hors contexte de requête (build prerender, etc.) — pas de geo
      return {};
    }
  });
