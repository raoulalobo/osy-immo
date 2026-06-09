// src/lib/auth-client.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Client BetterAuth utilisé côté navigateur ET côté SSR.
//        Expose :
//          - authClient.signIn / signUp / signOut / useSession ...
//          - Auto-injection des cookies dans les requêtes vers /api/auth/*.
//
// Interactions :
//  - Le plugin `convexClient` synchronise le token BetterAuth avec Convex (`setAuth`).
//  - L'URL de base par défaut est l'origine courante en navigateur ; en SSR on lit SITE_URL.
//
// Exemple :
//   const { data: session } = authClient.useSession();
//   await authClient.signIn.email({ email, password });
// -------------------------------------------------------------------------------------------------

import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
  // En navigateur : URL relative → utilise l'origine de la page.
  // En SSR/Node   : SITE_URL ou fallback localhost.
  baseURL:
    typeof window === "undefined"
      ? process.env.SITE_URL ?? "http://localhost:3000"
      : undefined,
  plugins: [convexClient()],
});
