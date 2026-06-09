// src/lib/utils.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Petits utilitaires partagés.
//  - `cn` : concatène des classNames tailwind en évitant les conflits via tailwind-merge.
//  - `formatPrice` : formate un prix en FCFA (locale fr-CM, devise XAF).
//  - `formatArea` : formate une surface en m².
//
// Exemple :
//   <div className={cn("p-4", isActive && "bg-brand-500")} />
//   formatPrice(450000) // "450 000 FCFA"
// -------------------------------------------------------------------------------------------------

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Locale fr-CM (Cameroun) + devise XAF (Franc CFA d'Afrique Centrale).
// Intl rend nativement "1 234 567 FCFA".
const priceFormatter = new Intl.NumberFormat("fr-CM", {
  style: "currency",
  currency: "XAF",
  maximumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return priceFormatter.format(value);
}

export function formatArea(m2: number): string {
  return `${m2.toLocaleString("fr-FR")} m²`;
}

/**
 * Construit une URL absolue à partir d'un chemin relatif.
 *
 * Pourquoi : `og:url`, `og:image` et tout lien partagé sur WhatsApp/Facebook
 * doivent être absolus. Les chemins relatifs sont ignorés par les crawlers.
 *
 * - Côté navigateur : utilise `window.location.origin` (toujours juste).
 * - Côté SSR (Node) : lit `VITE_SITE_URL` puis `SITE_URL` puis fallback localhost.
 *
 * Exemple : `getPublicUrl("/properties/abc")` → `"https://osy-immo.com/properties/abc"`
 */
export function getPublicUrl(path: string): string {
  // Normalise le path pour qu'il commence par /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Browser : on prend l'origine courante (couvre dev local + prod automatiquement)
  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalizedPath}`;
  }

  // SSR / Node : on lit l'env. import.meta.env est inliné par Vite au build,
  // process.env reste dispo si l'app est déployée derrière un serveur Node.
  const base =
    (import.meta as any).env?.VITE_SITE_URL ??
    (typeof process !== "undefined" ? process.env.VITE_SITE_URL ?? process.env.SITE_URL : "") ??
    "http://localhost:3000";

  return `${base.replace(/\/$/, "")}${normalizedPath}`;
}

/**
 * Construit le texte pré-rempli passé à `navigator.share()` (feuille système
 * mobile). Format compact pour rester lisible dans n'importe quel canal de
 * destination choisi par l'utilisateur (Messages, Mail, app de messagerie…).
 *
 * Exemple :
 *   🏡 Villa Bonapriso — 75 000 000 FCFA · Douala
 *   👉 https://osy-immo.com/properties/abc?ref=user_xyz
 */
export function buildShareText(opts: {
  title: string;
  price: number;
  city: string;
  url: string;
}): string {
  return `🏡 ${opts.title} — ${formatPrice(opts.price)} · ${opts.city}\n👉 ${opts.url}`;
}
