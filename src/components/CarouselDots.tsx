// src/components/CarouselDots.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Indicateur de progression pour les carrousels scroll-snap horizontaux.
//
//        Affiche un dot par slide ; le dot actif est visuellement étiré en
//        pill rouge accent. Au tap sur un dot, la slide correspondante glisse
//        vers la gauche du viewport via `scrollIntoView({ inline: "start" })`.
//
//        Détection de la slide active : `IntersectionObserver` avec `root` sur
//        le conteneur scrollable. Approche déclarative, sans listener `scroll`
//        (qui obligerait à debouncer). On garde la slide qui a la plus grande
//        `intersectionRatio` parmi celles `isIntersecting`.
//
//        Le composant est volontairement mobile-only : sur tablet+ on revient
//        en grille classique, les dots n'ont aucun sens. Passer
//        `className="sm:hidden"` au parent pour le cacher.
//
//        Performance : 1 IntersectionObserver par carrousel, observe N cibles
//        (≤ 6 dans notre cas). Coût négligeable, aucun listener global.
// -------------------------------------------------------------------------------------------------

import { useEffect, useState, type RefObject } from "react";
import { cn } from "~/lib/utils";

interface CarouselDotsProps {
  /** Ref du conteneur scrollable (le <div> avec overflow-x-auto + snap-x). */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Nombre de slides — utilisé pour rendre N dots. */
  count: number;
  /** Classes supplémentaires (ex: "sm:hidden" pour cacher sur tablet+). */
  className?: string;
}

/**
 * Hook : retourne l'index de la slide actuellement la plus visible dans le
 * conteneur scrollable. Re-attache l'observer si `count` change (ex: nouveaux
 * éléments chargés).
 */
function useActiveSlideIndex(
  containerRef: RefObject<HTMLDivElement | null>,
  count: number
): number {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // On observe les enfants DIRECTS du conteneur — chaque enfant = 1 slide.
    const slides = Array.from(container.children) as HTMLElement[];
    if (slides.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pour chaque batch d'updates, on cherche l'entry visible avec la plus
        // grande surface visible (intersectionRatio). C'est cette slide qui est
        // considérée comme "centrée" et devient active.
        let best: IntersectionObserverEntry | null = null;
        for (const e of entries) {
          if (
            e.isIntersecting &&
            (!best || e.intersectionRatio > best.intersectionRatio)
          ) {
            best = e;
          }
        }
        if (best) {
          const idx = slides.indexOf(best.target as HTMLElement);
          if (idx !== -1) setActive(idx);
        }
      },
      {
        // root = le conteneur scrollable lui-même → intersection mesurée par
        // rapport au conteneur, pas au viewport global.
        root: container,
        // Plusieurs thresholds pour capter les transitions fluides au swipe.
        threshold: [0.25, 0.5, 0.75, 1],
      }
    );

    slides.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // Re-créer l'observer si count change (nouveaux enfants ajoutés au DOM).
  }, [containerRef, count]);

  return active;
}

export function CarouselDots({
  containerRef,
  count,
  className,
}: CarouselDotsProps) {
  const active = useActiveSlideIndex(containerRef, count);

  // Si rien à afficher (count = 0) ou 1 seule slide (pas de progression à montrer)
  if (count <= 1) return null;

  function goTo(idx: number) {
    const container = containerRef.current;
    if (!container) return;
    const slide = container.children[idx] as HTMLElement | undefined;
    slide?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  }

  return (
    <div
      role="tablist"
      aria-label="Pagination du carrousel"
      className={cn(
        "mt-4 flex items-center justify-center gap-1.5",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => {
        const isActive = i === active;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-current={isActive ? "true" : undefined}
            aria-label={`Aller à l'élément ${i + 1} sur ${count}`}
            onClick={() => goTo(i)}
            // Hauteur fixe 6 px, largeur 6 → 24 quand active (pill effect).
            // Transition `width` + `background-color` : la pill grandit pendant
            // que la couleur change, c'est ce qui donne le feel "premium".
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-200 [transition-timing-function:var(--ease-swift-out)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
              isActive
                ? "w-6 bg-accent-500"
                : "w-1.5 bg-brand-200 hover:bg-brand-300"
            )}
          />
        );
      })}
    </div>
  );
}
