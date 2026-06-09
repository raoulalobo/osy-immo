// src/components/Breadcrumb.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Fil d'Ariane (breadcrumb) réutilisable dans chaque route concernée.
//
// Affiché juste sous la Navbar, donne à l'utilisateur sa position dans la
// hiérarchie de navigation et un moyen rapide de remonter d'un niveau.
//
// Convention dans le projet :
//   - "Accueil" est TOUJOURS le premier item (ancre vers `/`).
//   - Le DERNIER item est la page courante : rendu en font-medium, non cliquable,
//     avec aria-current="page".
//   - Les items intermédiaires sont des Link TanStack typés (params optionnels).
//
// Accessibilité :
//   - <nav aria-label="Fil d'Ariane"> + <ol> sémantique pour les lecteurs d'écran.
//   - aria-current="page" sur le dernier item.
//   - chevron `›` rendu via lucide ChevronRight + aria-hidden (décoratif).
//
// SEO :
//   - Le helper `buildBreadcrumbJsonLd` génère un meta tag JSON-LD BreadcrumbList
//     (schema.org) à inclure dans le head() des routes publiques pour activer
//     les rich snippets Google. Voir properties.$id.tsx et blog.$slug.tsx.
// -------------------------------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

export interface BreadcrumbItem {
  label: string;
  // Si `to` est défini, l'item est un Link TanStack cliquable.
  // Si absent, c'est un item non-cliquable (typiquement le dernier).
  // Le type `any` est tolérant pour ne pas exiger l'inférence TanStack complète
  // côté caller — on caste à la frontière du Link interne.
  to?: string;
  // Params pour les routes avec segment dynamique (ex: `/properties/$id`).
  params?: Record<string, string>;
  // Tooltip optionnel (utile pour afficher le titre complet quand le label
  // est tronqué via max-w + truncate sur mobile).
  title?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  // Permet d'override la className du wrapper si nécessaire (rare).
  className?: string;
}

/**
 * Composant fil d'Ariane générique. Rendu sous la Navbar de chaque route.
 *
 * Exemple :
 *   <Breadcrumb items={[
 *     { label: "Accueil", to: "/" },
 *     { label: "Annonces", to: "/properties" },
 *     { label: property.title, title: property.title },  // dernier item, non cliquable
 *   ]} />
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Fil d'Ariane"
      className={cn(
        "border-b border-brand-200/40 bg-white/60",
        className
      )}
    >
      <ol className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-6 py-2 text-xs">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const truncateCls = "truncate max-w-[200px] sm:max-w-xs";
          return (
            <li key={i} className="flex items-center gap-1">
              {/* Séparateur — pas avant le 1er item */}
              {i > 0 && (
                <ChevronRight
                  className="h-3 w-3 shrink-0 text-brand-700/40"
                  aria-hidden
                />
              )}
              {isLast || !item.to ? (
                // Page courante OU item statique → span non-cliquable
                <span
                  className={cn("font-medium text-brand-700", truncateCls)}
                  aria-current={isLast ? "page" : undefined}
                  title={item.title}
                >
                  {item.label}
                </span>
              ) : (
                // Item intermédiaire → Link TanStack typé.
                // Cast `as any` sur `to` pour rester tolérant aux signatures
                // typées strictement par TanStack Router (chaque route a son
                // type de path littéral).
                <Link
                  to={item.to as any}
                  params={item.params as any}
                  className={cn(
                    "text-brand-700/60 hover:text-accent-500 hover:underline",
                    truncateCls
                  )}
                  title={item.title}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// -------------------------------------------------------------------------------------------------
// SEO helper : génère un meta tag JSON-LD `BreadcrumbList` schema.org.
//
// Format Google : https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
// Permet aux SERP Google d'afficher la hiérarchie de navigation dans les rich
// snippets, ce qui améliore le CTR sur les pages profondes (annonces, articles).
//
// À utiliser dans le head() des routes publiques :
//   head: ({ loaderData }) => ({
//     meta: [
//       ...,
//       buildBreadcrumbJsonLd([
//         { label: "Accueil", url: "https://osy-immo.com/" },
//         { label: "Annonces", url: "https://osy-immo.com/properties" },
//         { label: property.title }, // sans url = dernier item, page courante
//       ]),
//     ],
//   });
// -------------------------------------------------------------------------------------------------

export interface BreadcrumbJsonLdItem {
  label: string;
  // URL absolue pour les items cliquables. Absent sur le dernier (page courante).
  url?: string;
}

/**
 * Composant React qui rend un `<script type="application/ld+json">`
 * BreadcrumbList Schema.org dans le DOM (SSR + hydratation).
 *
 * À placer dans le JSX des routes publiques (`/properties/:id`, `/blog/:slug`)
 * pour activer les rich snippets Google dans les SERP. Google crawl le HTML
 * SSR et lit le JSON-LD comme n'importe quel autre script structuré.
 *
 * Pourquoi React (et pas TanStack `head().scripts[]`) :
 *   La signature `scripts[]` de TanStack Start est limitée aux scripts EXTERNES
 *   (avec `src`). Pour un script inline avec `children`, il faut passer par le
 *   render React qui sera émis dans le HTML SSR.
 *
 * Usage :
 *   <BreadcrumbJsonLd items={[
 *     { label: "Accueil", url: "https://osy-immo.com/" },
 *     { label: "Annonces", url: "https://osy-immo.com/properties" },
 *     { label: property.title }, // dernier item, sans url
 *   ]} />
 */
export function BreadcrumbJsonLd({
  items,
}: {
  items: BreadcrumbJsonLdItem[];
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      // L'item URL n'est inclus que pour les positions cliquables — Google
      // accepte (et préfère) qu'on omette `item` pour la position courante.
      ...(item.url && { item: item.url }),
    })),
  };
  return (
    <script
      type="application/ld+json"
      // dangerouslySetInnerHTML car React échapperait les guillemets sinon
      // (le JSON-LD a besoin d'être du JSON brut, pas du texte échappé).
      // Safe ici car les `items` sont construits par notre code, pas du user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
