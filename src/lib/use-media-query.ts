// src/lib/use-media-query.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Hook minimaliste pour réagir aux media queries CSS côté React.
//
//        Utilisations typiques :
//          - `useMediaQuery("(max-width: 640px)")` → savoir si on est sur mobile
//          - `useMediaQuery("(prefers-reduced-motion: reduce)")` → respecter
//            les préférences d'animation utilisateur dans du JS
//
//  Détails techniques :
//    - SSR-safe : valeur initiale `false` quand `window` n'existe pas.
//    - Branche `change` listener au mount, cleanup au unmount.
//    - L'API `addEventListener('change')` est largement supportée (Safari ≥ 14).
//    - Pas de dépendance externe.
// -------------------------------------------------------------------------------------------------

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  // Initial state : on tente de lire la valeur dès le 1er rendu côté client,
  // sinon false pour le SSR (l'effect ci-dessous corrigera après hydratation).
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia(query);
    // Met à jour immédiatement au cas où la valeur SSR diffère
    setMatches(mql.matches);

    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
