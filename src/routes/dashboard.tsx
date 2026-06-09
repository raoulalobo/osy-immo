// src/routes/dashboard.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Layout (pathless wrapper) du segment `/dashboard`. NE rend qu'un `<Outlet/>`
//        pour laisser les sous-routes (`dashboard.index.tsx` et `dashboard.new.tsx`)
//        afficher leur contenu.
//
// Pourquoi ce fichier existe-t-il ?
//  - TanStack Router flat-routing crée une route imbriquée pour `dashboard.new.tsx`
//    avec `getParentRoute: () => DashboardRoute`. Si aucun `dashboard.tsx` n'existe,
//    le plugin référence une variable inexistante → la route enfant n'est pas
//    enregistrée et `/dashboard/new` répond "Not Found".
//  - Avoir ce layout résout le problème et permet de partager du contexte si besoin.
// -------------------------------------------------------------------------------------------------

import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  return <Outlet />;
}
