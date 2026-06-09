// src/routes/dashboard.new.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Page de création d'annonce `/dashboard/new`.
//        Délègue tout le formulaire au composant partagé `PropertyForm`
//        (mode "create") — voir `src/components/PropertyForm.tsx`.
//
//        L'annonce est créée en `draft` ; l'utilisateur la publie ensuite
//        via le bouton 🚀 Publier dans le dashboard.
// -------------------------------------------------------------------------------------------------

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Breadcrumb } from "~/components/Breadcrumb";
import { PropertyForm } from "~/components/PropertyForm";
import { FormSkeleton } from "~/components/Skeletons";
import { authClient } from "~/lib/auth-client";

export const Route = createFileRoute("/dashboard/new")({
  component: NewPropertyPage,
});

function NewPropertyPage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();

  // Redirection si non connecté (seulement après que la session ait fini de charger)
  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: "/auth/login" });
    }
  }, [isPending, session, navigate]);

  // Tant que la session BetterAuth se résout, on affiche un skeleton qui mime
  // le formulaire d'annonce — évite le flash de texte vide + élimine le CLS
  // au moment où le PropertyForm prend le relais.
  if (isPending) return <FormSkeleton />;
  // Session résolue mais absente → on a déclenché la redirection ci-dessus
  if (!session) return null;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Mon espace", to: "/dashboard" },
          { label: "Nouvelle annonce" },
        ]}
      />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Nouvelle annonce</h1>
        <p className="mt-1 text-brand-700/70">
          Renseignez les informations principales. Vous pourrez la publier ensuite
          depuis votre dashboard.
        </p>

        <PropertyForm mode="create" />
      </div>
    </>
  );
}
