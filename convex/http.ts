// convex/http.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Déclare le routeur HTTP de Convex et délègue tous les endpoints d'auth à BetterAuth
//        (signin, signup, callback OAuth, /api/auth/get-session, etc.).
//
// Interactions :
//  - Le helper `convexBetterAuthReactStart` côté serveur (src/lib/auth-server.ts) appelle
//    ce déploiement Convex sur le path `/api/auth/*`.
//  - Les cookies BetterAuth circulent ainsi entre le navigateur, Vite SSR et Convex.
// -------------------------------------------------------------------------------------------------

import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Monte toutes les routes /api/auth/* (signin, signup, callback, get-session...)
authComponent.registerRoutes(http, createAuth, {
  // CORS désactivé : Vite proxifie en same-origin via /api/auth/$ -> auth-server.handler
  cors: false,
});

export default http;
