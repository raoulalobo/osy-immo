// src/routes/api/auth.$.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Catch-all `/api/auth/*` qui délègue à BetterAuth via le helper Convex.
//        Couvre : signin, signup, signout, callback OAuth, get-session, etc.
//
// Interactions :
//  - `handler` est défini dans `src/lib/auth-server.ts` (convexBetterAuthReactStart).
//  - Les méthodes GET/POST sont supportées par BetterAuth ; on les forwarde toutes.
// -------------------------------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { handler } from "~/lib/auth-server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
