// vite.config.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Configuration Vite + TanStack Start pour le marketplace immobilier.
//        - Active le plugin TanStack Start (routing fichier-basé + SSR/streaming).
//        - Active Tailwind CSS v4 via son plugin Vite (pas de postcss.config.js requis).
//        - Définit les alias `~/*` (vers `src/`) et `convex/*` pour matcher tsconfig.
//
// Interactions :
//  - `src/router.tsx` consomme le router auto-généré par TanStack.
//  - `src/routeTree.gen.ts` est régénéré par @tanstack/router-plugin au démarrage.
//  - Les fonctions Convex importées depuis `convex/_generated/*` utilisent l'alias.
//
// Exemple : `pnpm dev` démarre Vite sur le port 3000 avec SSR TanStack Start.
// -------------------------------------------------------------------------------------------------

import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    // Tailwind v4 — auto-détecte `src/styles.css` qui contient `@import "tailwindcss"`
    tailwindcss(),
    // TanStack Start : génère routeTree.gen.ts à partir de src/routes/.
    // NB: depuis 1.168, le plugin ne prend plus d'option `target` — la sortie est un
    //     build SSR Vite standard (dist/client + dist/server/server.js) qu'on déploie
    //     ensuite vers la cible voulue (Vercel via api/ssr.ts, Node serveur, etc.).
    tanstackStart({
      tsr: {
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/routeTree.gen.ts",
      },
    }),
    viteReact(),
  ],
  server: {
    port: 3000,
  },
});
