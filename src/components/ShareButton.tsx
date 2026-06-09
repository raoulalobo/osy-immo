// src/components/ShareButton.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Bouton "Partager" pour une annonce immobilière.
//
//        Comportement unique et contextuel — 1 clic = 1 action :
//          - Sur mobile (navigator.share dispo) → ouvre la feuille de partage
//            système. L'utilisateur choisit son canal (WhatsApp, SMS, Mail,
//            Telegram, etc.) selon les apps installées. Pas de prescription
//            d'un canal particulier côté app.
//          - Sur desktop (pas de Web Share API) → copie l'URL canonique dans
//            le presse-papier + toast "Lien copié !".
//
//        Pas de menu déroulant : si l'utilisateur veut un canal spécifique
//        sur desktop, il colle depuis son clipboard.
//
//        Variants :
//          - `default` : bouton plein "Partager" + icône Share2 (page détail).
//          - `compact` : icône Share2 seule (tableau dashboard).
//
// Tracking :
//        Chaque action enregistre un event Convex `share` avec `utmSource` =
//        "native" (mobile) ou "copy" (desktop). Si l'utilisateur est connecté,
//        son `userId` est ajouté en `?ref=` pour les stats ambassadeurs.
//
// Accessibilité :
//        - aria-label sur le bouton.
//        - Feedback visuel quand le lien vient d'être copié (Check au lieu de
//          Share2 pendant 2 s sur le variant compact).
// -------------------------------------------------------------------------------------------------

import { useMutation } from "convex/react";
import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { authClient } from "~/lib/auth-client";
import { buildShareText, getPublicUrl } from "~/lib/utils";

interface ShareButtonProps {
  property: Doc<"properties">;
  variant?: "default" | "compact";
}

export function ShareButton({ property, variant = "default" }: ShareButtonProps) {
  const { data: session } = authClient.useSession();
  // Feedback visuel "icône Check" pendant 2 s après une copie réussie. Pas
  // utilisé pour navigator.share (la feuille système confirme déjà visuellement).
  const [copied, setCopied] = useState(false);
  // Mutation Convex pour enregistrer chaque action de partage en base.
  // Sert au breakdown sources dans les stats annonce (top canaux de viralité).
  const recordEvent = useMutation(api.events.record);

  /**
   * Construit l'URL canonique d'une annonce avec les paramètres tracking.
   *
   * - `?ref=<userId>`     : identifie l'utilisateur qui a généré le lien
   *                         (utilisé par stats "top ambassadeurs").
   * - `?utm_source=...`   : canal de partage ("native" | "copy") agrégé dans
   *                         le breakdown sources de la stats annonce.
   */
  const buildUrl = (utmSource: string) => {
    const base = getPublicUrl(`/properties/${property._id}`);
    const params = new URLSearchParams();
    if (session?.user?.id) params.set("ref", session.user.id);
    params.set("utm_source", utmSource);
    return `${base}?${params.toString()}`;
  };

  /**
   * Copie l'URL dans le presse-papier. Utilisé comme :
   *  - action principale sur desktop (où navigator.share est absent),
   *  - fallback si navigator.share plante (sauf AbortError = annulation user).
   */
  async function copyLink() {
    const url = buildUrl("copy");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Lien copié !");
      // Reset du feedback visuel après 2 s — délai standard "tap & hold".
      setTimeout(() => setCopied(false), 2000);
      // Tracking — non bloquant, .catch silencieux pour ne pas ennuyer l'UX
      // si Convex est lent ou indisponible.
      recordEvent({
        propertyId: property._id,
        type: "share",
        utmSource: "copy",
        refUserId: session?.user?.id,
      }).catch(() => {});
    } catch {
      toast.error("Impossible de copier le lien — copie-le manuellement.");
    }
  }

  /**
   * Handler unique appelé par les 2 variants. Choix du canal contextuel :
   *  - Si Web Share API dispo (mobile typiquement) → ouvre la feuille système.
   *    L'utilisateur peut TOUT À FAIT partager via WhatsApp depuis cette feuille
   *    si son téléphone a l'app installée — c'est juste qu'on ne FORCE plus
   *    ce canal côté code.
   *  - Sinon (desktop, navigateurs anciens) → copie le lien.
   *
   * AbortError (utilisateur a annulé la sheet système) → silence total, on
   * ne fallback PAS sur copy (il a explicitement choisi de ne rien faire).
   * Toute autre erreur → fallback copy + toast.
   */
  async function handleShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      const url = buildUrl("native");
      const text = buildShareText({
        title: property.title,
        price: property.price,
        city: property.city,
        url,
      });
      try {
        await navigator.share({
          title: property.title,
          text,
          url,
        });
        recordEvent({
          propertyId: property._id,
          type: "share",
          utmSource: "native",
          refUserId: session?.user?.id,
        }).catch(() => {});
        return;
      } catch (err: any) {
        // L'utilisateur a annulé la feuille système → on respecte ce choix,
        // pas de fallback ni de toast.
        if (err?.name === "AbortError") return;
        // Échec réel (permissions, support partiel) → on tombe en fallback copy.
      }
    }
    // Desktop ou Web Share API absente / en erreur → copie le lien.
    await copyLink();
  }

  // ----- Variant COMPACT : icône seule (tableaux denses, dashboard) ----------
  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleShare}
        aria-label="Partager cette annonce"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-brand-700/60 hover:bg-brand-100 hover:text-brand-700"
      >
        {/* Feedback visuel : si on vient de copier, on montre un Check pendant
            2 s avant de revenir à l'icône Share2 par défaut. */}
        {copied ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
      </button>
    );
  }

  // ----- Variant DEFAULT : bouton "Partager" plein (page détail annonce) ----
  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Partager cette annonce"
      className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 shadow-soft hover:bg-brand-50 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-emerald-600" />
          <span>Copié !</span>
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" />
          <span>Partager</span>
        </>
      )}
    </button>
  );
}
