// convex/auth.config.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Déclare les providers d'authentification connus de Convex.
//        Utilise le helper `getAuthConfigProvider` fourni par @convex-dev/better-auth pour
//        synchroniser automatiquement la configuration (applicationID + domain) entre
//        BetterAuth et Convex.
//
// Interactions :
//  - Lu par Convex au démarrage. Le SITE_URL doit être défini dans l'environnement Convex
//    (commande : `npx convex env set SITE_URL http://localhost:3000`).
// -------------------------------------------------------------------------------------------------

import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

export default {
  providers: [getAuthConfigProvider()],
};
