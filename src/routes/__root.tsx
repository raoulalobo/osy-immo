// src/routes/__root.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Layout racine de l'application — wrap toutes les routes.
//        - Configure le document HTML (head, body) via TanStack Start.
//        - Fournit `ConvexBetterAuthProvider` qui :
//             • monte le client Convex (alimente <ConvexProvider> en interne)
//             • SURTOUT, synchronise le JWT BetterAuth → Convex via setAuth()
//        - Affiche la `Navbar` + un `<Outlet/>` pour le rendu des routes enfants.
//
// Pourquoi PAS `<ConvexProvider>` direct ?
//   Sans `ConvexBetterAuthProvider`, le client Convex ignore tout du JWT
//   BetterAuth → côté serveur Convex, `ctx.auth.getUserIdentity()` est null
//   → tous les helpers `auth.getAuthUserId(ctx)` retournent null
//   → favoris, messagerie, dashboard owner, stats… tout casse en silence.
//
// Interactions :
//  - `context.convex` est défini dans `src/router.tsx`.
//  - `authClient` provient de `~/lib/auth-client` (déjà configuré avec convexClient()).
// -------------------------------------------------------------------------------------------------

import type { ReactNode } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "sonner";
import { Navbar } from "~/components/Navbar";
import { authClient } from "~/lib/auth-client";
import appCss from "~/styles.css?url";

interface RouterContext {
  convex: ConvexReactClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Osy-Immo — Marketplace immobilier" },
      {
        name: "description",
        content:
          "Trouvez votre prochain logement : appartements, maisons et terrains, à la vente comme à la location.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Favicon — pictogramme « immeubles » extrait du logo Osy-Immo
      // (logo/logo.png). Fichiers générés dans public/ :
      //   - favicon.ico  : fallback multi-tailles 16/32/48 (navigateurs anciens)
      //   - favicon.png  : 512×512 transparent (navigateurs modernes, PWA)
      //   - apple-touch-icon.png : 180×180 fond blanc opaque (requis par iOS)
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", type: "image/png", href: "/favicon.png", sizes: "512x512" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  // On lit le client Convex depuis le contexte injecté par le router
  const { convex } = Route.useRouteContext();

  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexBetterAuthProvider client={convex} authClient={authClient}>
          <div className="min-h-[100dvh] flex flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-brand-200/60 bg-white py-6 text-center text-sm text-brand-700/70">
              © {new Date().getFullYear()} Osy-Immo — TanStack Start · Convex · BetterAuth
            </footer>
          </div>
          <Toaster richColors position="top-right" />
        </ConvexBetterAuthProvider>
        {/* Vercel Analytics — Web Vitals + page views, complémentaire de notre
            tracking Convex (qui se concentre sur les events business : view,
            share, contact). Cookie-less, RGPD-friendly. */}
        <Analytics />
        <Scripts />
      </body>
    </html>
  );
}
