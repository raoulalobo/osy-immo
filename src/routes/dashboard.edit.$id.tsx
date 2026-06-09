// src/routes/dashboard.edit.$id.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Page d'édition d'une annonce existante `/dashboard/edit/:id`.
//        Charge la propriété via `api.properties.get`, vérifie que l'user
//        connecté en est bien le propriétaire, puis affiche le formulaire
//        partagé `PropertyForm` (mode "edit") pré-rempli avec les valeurs
//        actuelles.
//
// Sécurité :
//   - Redirige vers /auth/login si non connecté.
//   - Affiche un message si l'utilisateur n'est pas le propriétaire
//     (la mutation update côté serveur re-vérifie de toute façon).
//
// Exemple d'URL : `/dashboard/edit/jd75snq1j8t4h2f17tjx9hxt5s87h6h9`
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Breadcrumb } from "~/components/Breadcrumb";
import { PropertyForm, type PropertyFormState } from "~/components/PropertyForm";
import { FormSkeleton } from "~/components/Skeletons";
import { authClient } from "~/lib/auth-client";

export const Route = createFileRoute("/dashboard/edit/$id")({
  component: EditPropertyPage,
});

function EditPropertyPage() {
  const { id } = Route.useParams();
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const property = useQuery(api.properties.get, { id: id as Id<"properties"> });

  // Redirection si non connecté (après résolution session)
  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: "/auth/login" });
    }
  }, [isPending, session, navigate]);

  // Phase 1 : on attend que session ET property soient chargées.
  // Skeleton mimétique (titre + champs shimmer) plutôt qu'un texte brut.
  if (isPending || property === undefined) return <FormSkeleton />;
  if (!session) return null;

  // Phase 2 : propriété introuvable
  if (property === null) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Annonce introuvable</h1>
        <p className="mt-2 text-brand-700/70">
          Cette annonce n'existe pas ou a été supprimée.
        </p>
        <Link
          to="/dashboard"
          className="mt-4 inline-block rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600"
        >
          Retour au dashboard
        </Link>
      </div>
    );
  }

  // Phase 3 : garde-fou owner — si pas propriétaire, on bloque côté client.
  // La mutation Convex revérifie de toute façon (defense in depth).
  if (property.ownerId !== session.user.id) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Accès refusé</h1>
        <p className="mt-2 text-brand-700/70">
          Vous n'êtes pas le propriétaire de cette annonce.
        </p>
        <Link
          to="/properties/$id"
          params={{ id }}
          className="mt-4 inline-block rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200"
        >
          Voir l'annonce
        </Link>
      </div>
    );
  }

  // Phase 4 : tout OK → on construit l'état initial à partir des champs de la
  // propriété et on délègue le rendu au composant PropertyForm.
  // Note : les champs numériques sont sérialisés en string pour matcher l'API
  // des <input> ; les champs optionnels absents tombent sur "" (string vide).
  const initial: Partial<PropertyFormState> = {
    title: property.title,
    description: property.description,
    type: property.type,
    listingType: property.listingType,
    price: String(property.price),
    surface: String(property.surface),
    rooms: property.rooms !== undefined ? String(property.rooms) : "",
    bedrooms:
      property.bedrooms !== undefined ? String(property.bedrooms) : "",
    bathrooms:
      property.bathrooms !== undefined ? String(property.bathrooms) : "",
    yearBuilt:
      property.yearBuilt !== undefined ? String(property.yearBuilt) : "",
    energyClass: property.energyClass ?? "",
    address: property.address,
    city: property.city,
    postalCode: property.postalCode ?? "",
    region: property.region ?? "Centre",
    country: property.country,
    lat: property.lat !== undefined ? String(property.lat) : "",
    lng: property.lng !== undefined ? String(property.lng) : "",
    images: property.images,
    videos: property.videos ?? [],
    featuresText: property.features.join(", "),
    // Pré-remplit le choix réseaux sociaux sauvegardé ("images" | "video").
    // Sans ça, le radio retombait toujours sur "images" à la réouverture, donnant
    // l'impression que "Publier la vidéo principale" n'était pas persisté.
    // Fallback "images" pour les annonces antérieures (champ optionnel).
    socialMediaChoice: property.socialMediaChoice ?? "images",
  };

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Mon espace", to: "/dashboard" },
          { label: `Modifier « ${property.title} »`, title: property.title },
        ]}
      />
      <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Modifier l'annonce
          </h1>
          <p className="mt-1 text-brand-700/70">
            Mettez à jour les informations. Les modifications sont visibles
            immédiatement sur la page publique.
          </p>
        </div>
        <Link
          to="/properties/$id"
          params={{ id }}
          className="hidden shrink-0 rounded-full bg-brand-100 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-200 sm:inline-block"
        >
          Voir l'annonce
        </Link>
      </div>

      <PropertyForm
        mode="edit"
        propertyId={id as Id<"properties">}
        initial={initial}
        // Pour afficher (ou non) le bouton "Enregistrer & re-publier sur les
        // réseaux" — visible uniquement si l'annonce est active.
        currentStatus={property.status}
      />
      </div>
    </>
  );
}
