// convex/convex.config.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Déclare les composants Convex utilisés (équivalent des plugins).
//        Ici on monte le composant `@convex-dev/better-auth` qui injecte automatiquement
//        les tables internes (users, sessions, accounts, verifications, jwks, ...).
//
// Interactions :
//  - `convex/auth.ts` consomme `components.betterAuth` pour instancier l'auth.
//  - Les tables `users` etc. sont disponibles via `ctx.db.system` ou via le helper d'auth.
// -------------------------------------------------------------------------------------------------

import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";

const app = defineApp();
app.use(betterAuth); // monte les tables internes nécessaires à BetterAuth

export default app;
