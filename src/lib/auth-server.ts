// src/lib/auth-server.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Helper TanStack Start qui proxie les requêtes `/api/auth/*` vers le déploiement Convex.
//        Fournit également des helpers SSR (`fetchAuthQuery` / `fetchAuthMutation`) qui
//        propagent automatiquement le token BetterAuth pour appeler les fonctions Convex
//        authentifiées depuis les loaders de routes.
//
// Variables d'env requises :
//  - VITE_CONVEX_URL      : URL HTTPS du déploiement Convex.
//  - VITE_CONVEX_SITE_URL : URL HTTP (origine) du site Convex (souvent identique).
// -------------------------------------------------------------------------------------------------

import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";

const convexUrl =
  process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL ?? "";
const convexSiteUrl =
  process.env.VITE_CONVEX_SITE_URL ?? convexUrl.replace(".convex.cloud", ".convex.site");

export const {
  handler,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthReactStart({
  convexUrl,
  convexSiteUrl,
});
