// src/components/PropertyCard.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Carte d'aperçu d'une annonce dans les listes (homepage, /properties, /favorites).
//        - Affiche image principale, titre, ville, prix, surface et pièces.
//        - Bouton coeur pour basculer le favori (mutation Convex, état réactif).
//
// Props :
//  - property : objet `Doc<"properties">` Convex.
//
// Interactions :
//  - Toggle favori via `api.favorites.toggle`. Si l'utilisateur n'est pas connecté,
//    on redirige vers /auth/login.
// -------------------------------------------------------------------------------------------------

import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Bed, CalendarClock, Heart, MapPin, Maximize2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { authClient } from "~/lib/auth-client";
import { cn, formatArea, formatPrice } from "~/lib/utils";

export function PropertyCard({ property }: { property: Doc<"properties"> }) {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  // Query optionnelle : on ne demande l'état favori que si on a une session
  const isFav = useQuery(
    api.favorites.isFavorite,
    session ? { propertyId: property._id } : "skip"
  );
  const toggleFav = useMutation(api.favorites.toggle);

  const handleToggleFav = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session) {
      // Pas connecté → on envoie vers /auth/login
      void navigate({ to: "/auth/login" });
      return;
    }
    // try/catch indispensable : sinon une mutation qui throw (token expiré,
    // réseau, conflit DB) file en console sans feedback utilisateur — le cœur
    // ne change pas d'état et l'utilisateur ne comprend pas pourquoi.
    try {
      const nowFav = await toggleFav({ propertyId: property._id });
      toast.success(nowFav ? "Ajouté aux favoris" : "Retiré des favoris");
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de mettre à jour le favori");
    }
  };

  // Première image OU placeholder dégradé
  const heroImage = property.images[0];

  return (
    <Link
      to="/properties/$id"
      params={{ id: property._id }}
      // Transition spécifiquement sur transform + box-shadow (jamais `all` —
      // c'est l'un des principaux signaux "AI-generic" et ça coûte des repaints
      // inutiles). Durée 200ms + courbe custom (--ease-swift-out) plus marquée.
      // `:active` scale donne le feedback tactile au moment du click.
      className="group block overflow-hidden rounded-[var(--radius-card)] bg-white shadow-soft transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-swift-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] active:scale-[0.99]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-100">
        {heroImage ? (
          <img
            src={heroImage}
            alt={property.title}
            loading="lazy"
            // Zoom photo au hover — transition explicite sur transform seulement.
            // Durée 400ms (plus long que la carte parent) → "lag" léger entre la
            // levée de la carte et le zoom photo : ça donne du "poids" visuel.
            className="h-full w-full object-cover transition-transform duration-[400ms] [transition-timing-function:var(--ease-swift-out)] group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-200 to-brand-500/40 text-brand-700">
            <span className="text-sm font-medium">Photo à venir</span>
          </div>
        )}

        {/* Tag type d'annonce — rouge pour la vente, bleu pour la location.
            Aide l'œil à scanner rapidement le type d'opération. */}
        <span
          className={cn(
            "absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white shadow",
            property.listingType === "sale" ? "bg-accent-500" : "bg-brand-500"
          )}
        >
          {property.listingType === "sale" ? "Vente" : "Location"}
        </span>

        {/* Bouton favori — transition sur le cœur lui-même (scale au toggle)
            pour confirmer l'action. `:active` scale 0.9 = feedback tactile. */}
        <button
          type="button"
          onClick={handleToggleFav}
          aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={isFav ?? false}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-brand-700 shadow transition-transform duration-150 [transition-timing-function:var(--ease-swift-out)] hover:bg-white active:scale-[0.9]"
        >
          <Heart
            className={cn(
              "h-4 w-4 transition-[transform,fill,stroke] duration-200 [transition-timing-function:var(--ease-swift-out)]",
              // Quand le favori est activé, le cœur grossit légèrement (110%) en
              // même temps qu'il se remplit de rouge — confirmation visuelle nette.
              isFav
                ? "scale-110 fill-red-500 stroke-red-500"
                : "scale-100 stroke-current"
            )}
          />
        </button>
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 font-medium tracking-tight">
            {property.title}
          </h3>
          <p className="shrink-0 text-right font-semibold text-brand-700">
            {formatPrice(property.price)}
            {property.listingType === "rent" && (
              <span className="text-xs font-normal text-brand-700/70"> /mois</span>
            )}
          </p>
        </div>
        <p className="flex items-center gap-1 text-sm text-brand-700/70">
          <MapPin className="h-3.5 w-3.5" />
          <span className="truncate">
            {[property.city, property.region].filter(Boolean).join(" · ")}
          </span>
        </p>
        <div className="flex items-center gap-4 pt-1 text-sm text-brand-700/80">
          <span className="inline-flex items-center gap-1">
            <Maximize2 className="h-3.5 w-3.5" />
            {formatArea(property.surface)}
          </span>
          {property.rooms !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Bed className="h-3.5 w-3.5" />
              {property.rooms} pièces
            </span>
          )}
        </div>

        {/* Badges modalités de paiement — uniquement si le vendeur les propose
            (champs optionnels : absents sur les annonces antérieures). Les
            textes détaillés (installmentDetails / exchangeDetails) ne sont
            affichés que sur la page détail, trop longs pour la carte. */}
        {(property.acceptsInstallments || property.acceptsExchange) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {property.acceptsInstallments && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CalendarClock className="h-3 w-3" />
                Paiement en tranches
              </span>
            )}
            {property.acceptsExchange && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                <ArrowLeftRight className="h-3 w-3" />
                Échange accepté
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
