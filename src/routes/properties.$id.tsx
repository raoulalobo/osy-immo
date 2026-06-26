// src/routes/properties.$id.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Page détail d'une annonce. Affiche galerie d'images, infos clés, description,
//        formulaire de contact, bouton favori, bouton "Partager"
//        (Web Share API mobile / copie du lien sur desktop — voir ShareButton.tsx).
//
// SSR & partage :
//  - `loader` charge la propriété côté serveur via le client Convex. C'est ce qui permet
//    à `head()` ci-dessous de générer des balises Open Graph dynamiques, indispensables
//    pour que WhatsApp/Facebook affichent un preview riche (image, titre, description).
//  - WhatsApp ne crawl PAS de JavaScript : les meta doivent être présentes dans la réponse
//    HTML initiale → le loader est obligatoire (vs. useQuery client seul).
//
// Interactions client :
//  - useQuery(api.properties.get, { id }) — reste en complément du loader pour la
//    réactivité live (édition, statut, favoris).
//  - useMutation(api.inquiries.send / favorites.toggle).
// -------------------------------------------------------------------------------------------------

import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { z } from "zod";
import {
  BarChart3,
  Bath,
  Bed,
  Calendar,
  Eye,
  Heart,
  MapPin,
  Maximize2,
  Pencil,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Breadcrumb, BreadcrumbJsonLd } from "~/components/Breadcrumb";
import { PropertyCard } from "~/components/PropertyCard";
import { ShareButton } from "~/components/ShareButton";
import { classifyReferrer } from "~/lib/referrer";
import { authClient } from "~/lib/auth-client";
import { getVercelGeo } from "~/lib/get-geo";
import { cn, formatArea, formatPrice, getPublicUrl } from "~/lib/utils";
import { buildPropertyOgMeta } from "~/lib/og";

// Schéma des query params acceptés. Toutes optionnelles ; on les ignore
// silencieusement si absentes. Ces params sont POSÉS par le ShareButton
// (?ref=<userId>&utm_source=<channel>) et LUS par le hook tracking ci-dessous.
const propertySearchSchema = z.object({
  ref: z.string().optional(),
  utm_source: z.string().optional(),
});

export const Route = createFileRoute("/properties/$id")({
  validateSearch: propertySearchSchema,

  // ----- Loader SSR -----------------------------------------------------------
  // Le contexte du router expose le client Convex (`src/router.tsx`).
  // On throw `notFound()` (TanStack Router) si la propriété n'existe pas — la
  // page rendra alors le component "Not Found" au lieu de planter le head().
  //
  // Phase 2 analytics : on capture aussi la géolocalisation côté SSR via les
  // headers Vercel injectés par le edge (x-vercel-ip-country / city / region).
  // Ces données sont passées au component, qui les transmet à `events:record`
  // dans le hook tracking côté client (pas de double-recording).
  loader: async ({ context: { convex }, params }) => {
    const property = await convex.query(api.properties.get, {
      id: params.id as Id<"properties">,
    });
    if (!property) {
      throw notFound();
    }

    // Géo Vercel — `createIsomorphicFn` retourne l'impl SSR (qui lit les headers)
    // côté serveur, et un stub `{}` côté client. Aucun risque de fuite des
    // modules server-only dans le bundle navigateur.
    const geo = getVercelGeo();

    return { property, geo };
  },

  // ----- Head dynamique -------------------------------------------------------
  // Génère les balises Open Graph (WhatsApp, Facebook, iMessage, LinkedIn)
  // ET Twitter Card à partir de la donnée chargée par le loader.
  // `loaderData` peut être `undefined` pendant un prefetch — toujours protéger.
  head: ({ loaderData }) => {
    if (!loaderData?.property) return { meta: [] };
    // Balises Open Graph + Twitter générées par le builder partagé
    // (src/lib/og.ts), réutilisé à l'identique par la route de lien court
    // /p/$slug pour que les deux URLs produisent le même aperçu de partage.
    return buildPropertyOgMeta(loaderData.property);
  },

  // Composant "Not Found" personnalisé — affiché quand le loader throw notFound()
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl p-10 text-center">
      <h1 className="text-2xl font-semibold">Annonce introuvable</h1>
      <p className="mt-2 text-brand-700/70">
        Cette annonce n'existe plus ou a été supprimée.
      </p>
      <Link
        to="/properties"
        className="mt-6 inline-block rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
      >
        Voir les autres annonces
      </Link>
    </div>
  ),

  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { id } = Route.useParams();
  const propertyId = id as Id<"properties">;

  // Search params capturés depuis l'URL — posés par les liens partagés.
  // `ref` = id du user qui a partagé · `utm_source` = canal (whatsapp, copy, native).
  const { ref: refUserId, utm_source: utmSource } = Route.useSearch();

  // Donnée pré-chargée par le loader SSR — disponible dès le premier rendu
  // (pas de flash "Chargement..."). On la garde comme valeur initiale.
  // `geo` est rempli quand on est servi par Vercel ; vide sinon (dev local).
  const { property: initialProperty, geo } = Route.useLoaderData();

  // useQuery garde la donnée synchronisée en live (édition, statut, etc.).
  // Tant que le client Convex n'a pas répondu, on retombe sur initialProperty.
  const live = useQuery(api.properties.get, { id: propertyId });
  const property = live ?? initialProperty;

  const { data: session } = authClient.useSession();
  const isFav = useQuery(
    api.favorites.isFavorite,
    session ? { propertyId } : "skip"
  );
  const toggleFav = useMutation(api.favorites.toggle);

  // Flags d'affichage dérivés du statut + propriété de l'annonce.
  // - isOwner   : le user connecté est le propriétaire → on lui montrera le
  //               OwnerPanel à droite (gestion d'annonce) plutôt que le bandeau
  //               visiteur "Vendue / Louée / Retirée".
  // - isReadOnly: l'annonce n'est plus en vente / location active. Conséquences :
  //               bandeau visible (pour les visiteurs), bouton Favori désactivé,
  //               ContactArea remplacé par un message d'indisponibilité, section
  //               "Annonces similaires" affichée en bas de page.
  const isOwner = Boolean(
    session?.user?.id && property && session.user.id === property.ownerId
  );
  const isReadOnly = property ? property.status !== "active" : false;

  // Tracking : on enregistre la vue de cette annonce dès le mount côté client.
  // Détails dans le hook ci-dessous.
  useTrackPageView({
    propertyId,
    refUserId,
    utmSource,
    country: geo?.country,
    city: geo?.city,
  });

  // Edge case : la propriété a été supprimée pendant la session (live === null).
  // Le loader a déjà filtré l'absence initiale via notFound().
  if (property === null) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="text-2xl font-semibold">Annonce introuvable</h1>
        <p className="mt-2 text-brand-700/70">
          Cette annonce vient d'être supprimée.
        </p>
        <Link
          to="/properties"
          className="mt-6 inline-block rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
        >
          Voir les autres annonces
        </Link>
      </div>
    );
  }

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Annonces", to: "/properties" },
          { label: property.title, title: property.title },
        ]}
      />
      {/* JSON-LD BreadcrumbList pour les rich snippets Google. Rendu dans le
          HTML SSR — crawlable, pas de hydratation à attendre. */}
      <BreadcrumbJsonLd
        items={[
          { label: "Accueil", url: getPublicUrl("/") },
          { label: "Annonces", url: getPublicUrl("/properties") },
          { label: property.title },
        ]}
      />
      <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Bandeau d'overlay statut — visible uniquement pour les VISITEURS
          (pas l'owner qui voit son OwnerPanel à droite avec un badge dédié).
          Affiché quand l'annonce est sold / rented / archived pour clarifier
          que le bien n'est plus disponible — évite la confusion d'arriver
          sur une "vraie" page de vente alors que c'est trop tard. */}
      {isReadOnly && !isOwner && <StatusBanner status={property.status} />}

      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
            {property.listingType === "sale" ? "À vendre" : "À louer"} ·{" "}
            {property.type === "apartment"
              ? "Appartement"
              : property.type === "house"
                ? "Maison"
                : property.type === "land"
                  ? "Terrain"
                  : "Commercial"}
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {property.title}
          </h1>
          <p className="mt-1 flex items-center gap-1 text-brand-700/70">
            <MapPin className="h-4 w-4" />
            {[property.address, property.city, property.region, property.country]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-brand-700">
            {formatPrice(property.price)}
            {property.listingType === "rent" && (
              <span className="text-sm font-normal text-brand-700/70"> /mois</span>
            )}
          </p>
          {/* Actions : Favori + Partager.
              Le Favori est désactivé pour les annonces non-active (vendues,
              louées, retirées) — sauver une annonce qu'on ne peut plus
              acheter n'a pas de sens. Le bouton Partager reste actif :
              partager une annonce "vendue" peut servir de référence à
              l'utilisateur (montrer ce qui se vendait, demander des biens
              similaires à son réseau). */}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isReadOnly}
              onClick={async () => {
                if (!session) {
                  toast.error("Connectez-vous pour ajouter aux favoris");
                  return;
                }
                await toggleFav({ propertyId });
                toast.success(isFav ? "Retiré des favoris" : "Ajouté aux favoris");
              }}
              title={
                isReadOnly
                  ? "Annonce non active — favoris désactivés"
                  : undefined
              }
              className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-sm hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  isFav ? "fill-red-500 stroke-red-500" : "stroke-current"
                )}
              />
              {isFav ? "Favori" : "Ajouter aux favoris"}
            </button>
            <ShareButton property={property} />
          </div>
        </div>
      </div>

      {/* Galerie d'images */}
      <Gallery images={property.images} title={property.title} />

      {/* Vidéos (optionnel — listées sous la galerie d'images) */}
      {property.videos && property.videos.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">Visite vidéo</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {property.videos.map((src) => (
              <video
                key={src}
                src={src}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full rounded-2xl bg-ink-900"
              />
            ))}
          </div>
        </section>
      )}

      {/* Localisation : carte OpenStreetMap (sans API key) + lien Google Maps */}
      {property.lat !== undefined && property.lng !== undefined && (
        <LocationMap
          lat={property.lat}
          lng={property.lng}
          title={property.title}
        />
      )}

      {/* Faits clés */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FactCard icon={<Maximize2 />} label="Surface" value={formatArea(property.surface)} />
        {property.rooms !== undefined && (
          <FactCard icon={<Bed />} label="Pièces" value={`${property.rooms}`} />
        )}
        {property.bathrooms !== undefined && (
          <FactCard icon={<Bath />} label="SDB" value={`${property.bathrooms}`} />
        )}
        {property.yearBuilt && (
          <FactCard icon={<Calendar />} label="Année" value={`${property.yearBuilt}`} />
        )}
        {property.energyClass && (
          <FactCard icon={<Zap />} label="Énergie" value={property.energyClass} />
        )}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1fr,360px]">
        {/* Description + équipements */}
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-xl font-semibold">Description</h2>
            <p className="whitespace-pre-line text-brand-700/90">
              {property.description}
            </p>
          </section>

          {property.features.length > 0 && (
            <section>
              <h2 className="mb-2 text-xl font-semibold">Équipements</h2>
              <ul className="flex flex-wrap gap-2">
                {property.features.map((f) => (
                  <li
                    key={f}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-sm text-brand-700"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Module de contact / panneau owner :
              - Visiteur ou autre user → "Contacter le propriétaire"
              - Owner → panneau de gestion (stats + raccourcis)
            On change le titre dynamiquement selon le contexte pour éviter
            l'ironie "Contacter le propriétaire" quand on EST le propriétaire. */}
        <aside className="h-fit rounded-2xl bg-white p-6 shadow-soft">
          {session?.user?.id === property.ownerId ? (
            <OwnerPanel property={property} session={session} />
          ) : (
            <>
              {/* Mini-card vendeur — affichée UNIQUEMENT pour les visiteurs
                  non-owner. Donne un visage humain à l'annonce et bâtit la
                  confiance avant le contact. La query users.getPublicProfile
                  filtre les PII (email, phone) côté serveur. */}
              <SellerMiniCard ownerId={property.ownerId} />
              <h2 className="text-lg font-semibold">
                Contacter le propriétaire
              </h2>
              <ContactArea property={property} session={session} />
            </>
          )}
        </aside>
      </div>

      {/* Annonces similaires — affichées en bas de page quand l'annonce
          courante est sold / rented / archived. Encourage l'utilisateur
          à explorer le marketplace plutôt que de quitter le site sur une
          page "indisponible". La query renvoie une liste vide ou la
          section est cachée (cf. SimilarPropertiesSection plus bas). */}
      {isReadOnly && <SimilarPropertiesSection propertyId={propertyId} />}
      </div>
    </>
  );
}

// -------------------------------------------------------------------------------------------------
// ContactArea : routeur d'expérience selon le contexte utilisateur.
//
//   - Visiteur anonyme         → formulaire email (table `inquiries`)
//   - Utilisateur connecté     → bouton "Discuter" qui démarre une conversation interne
//
// Note : le cas "propriétaire de l'annonce" est désormais géré par <OwnerPanel/>
//        directement dans l'aside parent (voir le ternaire au-dessus). Ça évite
//        d'afficher l'en-tête "Contacter le propriétaire" pour le propriétaire,
//        qui n'est pas pertinent.
// -------------------------------------------------------------------------------------------------
function ContactArea({
  property,
  session,
}: {
  property: any;
  session: { user: { id: string } } | null | undefined;
}) {
  // Cas annonce non-active (vendue / louée / retirée) — le propriétaire ne
  // peut plus être contacté. On l'explique pour éviter à l'utilisateur de
  // remplir un formulaire qui ne sera jamais lu.
  if (property.status !== "active") {
    return (
      <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700/80">
        Cette annonce n'est plus disponible — le propriétaire ne peut plus
        être contacté.
      </p>
    );
  }

  // Cas connecté : messagerie interne (thread persistant + notifs in-app)
  if (session?.user?.id) {
    return <StartConversation propertyId={property._id} />;
  }

  // Cas visiteur anonyme : formulaire one-shot historique
  return <ContactForm propertyId={property._id} />;
}

// -------------------------------------------------------------------------------------------------
// StatusBanner : bandeau visuel signalant qu'une annonce n'est plus active.
// Affiché en haut de la page détail UNIQUEMENT pour les visiteurs non-owner
// (le propriétaire voit le statut via son OwnerPanel à droite).
// -------------------------------------------------------------------------------------------------
function StatusBanner({ status }: { status: string }) {
  // Mapping centralisé statut → libellé + ton + couleur. Cohérent avec les
  // couleurs déjà utilisées dans le dashboard owner et le badge OwnerPanel.
  const meta = ({
    sold: {
      label: "Vendue",
      intro:
        "Cette annonce a été vendue. Découvrez d'autres biens similaires ci-dessous.",
      bg: "bg-blue-50",
      text: "text-blue-800",
      border: "border-blue-500",
    },
    rented: {
      label: "Louée",
      intro:
        "Ce bien a déjà trouvé locataire. Voyez d'autres locations similaires ci-dessous.",
      bg: "bg-violet-50",
      text: "text-violet-800",
      border: "border-violet-500",
    },
    archived: {
      label: "Retirée",
      intro:
        "Cette annonce a été retirée par le propriétaire. Explorez d'autres annonces actives.",
      bg: "bg-brand-100",
      text: "text-brand-800",
      border: "border-brand-400",
    },
  } as const)[status as "sold" | "rented" | "archived"];
  if (!meta) return null;

  return (
    <div
      className={cn(
        "mb-6 rounded-lg border-l-4 p-4",
        meta.bg,
        meta.border
      )}
      role="status"
      aria-live="polite"
    >
      <p className={cn("font-semibold", meta.text)}>Annonce {meta.label}</p>
      <p className={cn("mt-1 text-sm", meta.text)}>{meta.intro}</p>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// SimilarPropertiesSection : grille d'annonces similaires affichée en bas
// de page quand l'annonce courante n'est plus active. Encourage le visiteur
// à explorer le marketplace plutôt que de quitter le site.
//
// Source : api.properties.listSimilar — matching par ville + listingType avec
// fallback élargi si la ville n'a pas assez d'annonces actives.
// -------------------------------------------------------------------------------------------------
function SimilarPropertiesSection({
  propertyId,
}: {
  propertyId: Id<"properties">;
}) {
  const similar = useQuery(api.properties.listSimilar, {
    propertyId,
    limit: 4,
  });
  // Query en cours → skeleton minimal. Aucune annonce trouvée → on n'affiche
  // rien plutôt qu'un message vide (pas pertinent dans la timeline d'une page).
  if (similar === undefined || similar.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-semibold">Annonces similaires</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {similar.map((p) => (
          <PropertyCard key={p._id} property={p} />
        ))}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------------------------------
// OwnerPanel : panneau "gestion" affiché à la place du formulaire de contact
// quand l'utilisateur courant EST le propriétaire de l'annonce.
//
// Contenu :
//   - Salutation chaleureuse (utilise le prénom de la session si dispo)
//   - Badge de statut coloré (Brouillon / Publiée / Vendue / Louée / Archivée)
//   - Stat live : vues sur les 7 derniers jours (api.events.statsForProperty)
//   - CTA primaire "Modifier l'annonce"     → /dashboard/edit/$id
//   - CTA secondaire "Statistiques détaillées" → /dashboard/stats/$id
//   - Lien discret "Retour à l'espace"      → /dashboard
//
// Pourquoi pas seulement un toast "tu es propriétaire" :
//   Le précédent message court manquait de valeur. Ici on transforme l'aside
//   en mini-dashboard contextuel, l'utilisateur peut agir sans changer de page.
// -------------------------------------------------------------------------------------------------
function OwnerPanel({
  property,
  session,
}: {
  property: any;
  session: { user: { id: string; name?: string | null; email?: string | null } };
}) {
  // Stat live des vues sur 7 jours — query Owner-only (renvoie null si pas owner).
  // Le useQuery est non-bloquant : la page s'affiche immédiatement, les vues
  // remplacent le "—" dès que la query résout.
  const stats = useQuery(api.events.statsForProperty, {
    propertyId: property._id,
    days: 7,
  });
  const views = stats?.counts?.view ?? 0;

  // Prénom préféré → fallback email → fallback générique
  const greeting =
    session.user.name?.split(" ")[0] ??
    session.user.email?.split("@")[0] ??
    "vous";

  // Type structurel d'une entrée de badge — utilisé pour typer le fallback
  // ET le Record, en restant tolérant aux variantes de couleur.
  type StatusMeta = { label: string; dot: string; bg: string; text: string };

  // Fallback explicite — utilisé si property.status n'est dans aucune des
  // clés connues (improbable mais protège contre une migration future).
  const DEFAULT_META: StatusMeta = {
    label: "Brouillon",
    dot: "bg-amber-500",
    bg: "bg-amber-100",
    text: "text-amber-800",
  };

  // Map des couleurs de badge par statut. Cohérent avec le badge "Brouillon"
  // ambre déjà utilisé dans le dashboard (`dashboard.index.tsx`).
  const STATUS_META: Record<string, StatusMeta> = {
    draft: DEFAULT_META,
    active: {
      label: "Publiée",
      dot: "bg-emerald-500",
      bg: "bg-emerald-100",
      text: "text-emerald-800",
    },
    sold: {
      label: "Vendue",
      dot: "bg-blue-500",
      bg: "bg-blue-100",
      text: "text-blue-800",
    },
    rented: {
      label: "Louée",
      dot: "bg-violet-500",
      bg: "bg-violet-100",
      text: "text-violet-800",
    },
    archived: {
      label: "Archivée",
      dot: "bg-brand-400",
      bg: "bg-brand-100",
      text: "text-brand-700",
    },
  };
  // Le `??` garantit le fallback si property.status est inconnu.
  const meta: StatusMeta = STATUS_META[property.status] ?? DEFAULT_META;

  return (
    <div>
      {/* En-tête : salutation + badge statut */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            👋 Bonjour {greeting}
          </h2>
          <p className="mt-0.5 text-sm text-brand-700/70">
            C'est votre annonce — voici un aperçu rapide.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            meta.bg,
            meta.text
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>

      {/* Stat live : vues sur 7 jours (encart compact, valeur seule). */}
      <div className="mt-4 rounded-xl bg-brand-50 p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-brand-700/70">
          <Eye className="h-3.5 w-3.5" />
          Vues sur 7 jours
        </div>
        <p className="mt-1 text-2xl font-semibold text-brand-700">
          {stats === undefined ? "—" : views}
        </p>
      </div>

      {/* CTA principal : Modifier l'annonce — accent red pour ressortir */}
      <Link
        to="/dashboard/edit/$id"
        params={{ id: property._id }}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.98] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
      >
        <Pencil className="h-4 w-4" />
        Modifier l'annonce
      </Link>

      {/* CTA secondaire : stats détaillées (graph 30j, funnel, breakdown) */}
      <Link
        to="/dashboard/stats/$id"
        params={{ id: property._id }}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 active:scale-[0.98] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
      >
        <BarChart3 className="h-4 w-4" />
        Statistiques détaillées
      </Link>

      {/* Lien discret vers le dashboard global */}
      <p className="mt-4 text-center text-xs text-brand-700/60">
        Gérer toutes vos annonces dans{" "}
        <Link
          to="/dashboard"
          className="font-medium text-accent-500 hover:underline"
        >
          votre espace
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * Formulaire compact "Démarrer une conversation" — appelle la mutation Convex
 * `messages.startConversation` puis redirige vers la page du thread.
 */
function StartConversation({ propertyId }: { propertyId: Id<"properties"> }) {
  const start = useMutation(api.messages.startConversation);
  const navigate = useNavigate();
  const [body, setBody] = useState(
    "Bonjour, je suis intéressé(e) par votre annonce. Pourriez-vous me donner plus d'informations ?"
  );
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        try {
          const conversationId = await start({
            propertyId,
            body: body.trim(),
          });
          toast.success("Message envoyé !");
          void navigate({
            to: "/dashboard/messages/$id",
            params: { id: conversationId },
          });
        } catch (err: any) {
          toast.error(err?.message ?? "Erreur lors de l'envoi");
        } finally {
          setPending(false);
        }
      }}
      className="mt-4 space-y-3"
    >
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
          Votre message
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={5}
          maxLength={2000}
          className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <p className="mt-1 text-xs text-brand-700/60">
          Ton message sera envoyé via la messagerie interne. Tu retrouveras ta
          conversation dans Messages.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending || body.trim().length === 0}
        className="inline-flex w-full items-center justify-center rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Démarrer la conversation"}
      </button>
    </form>
  );
}

function FactCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2 text-brand-700/70">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return (
      <div className="flex aspect-[16/8] items-center justify-center rounded-2xl bg-gradient-to-br from-brand-200 to-brand-500/40 text-brand-700">
        Photo à venir
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-brand-100">
        <img
          src={images[active]}
          alt={title}
          className="h-full w-full object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "h-20 w-28 shrink-0 overflow-hidden rounded-lg border-2",
                i === active ? "border-brand-500" : "border-transparent opacity-70"
              )}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactForm({ propertyId }: { propertyId: Id<"properties"> }) {
  const send = useMutation(api.inquiries.send);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fromName: "",
    fromEmail: "",
    fromPhone: "",
    message: "Bonjour, je suis intéressé(e) par votre annonce…",
  });
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        try {
          await send({
            propertyId,
            fromName: form.fromName,
            fromEmail: form.fromEmail,
            fromPhone: form.fromPhone || undefined,
            message: form.message,
          });
          toast.success("Message envoyé !");
          void navigate({ to: "/" });
        } catch (err: any) {
          toast.error(err?.message ?? "Erreur lors de l'envoi");
        } finally {
          setPending(false);
        }
      }}
      className="mt-4 space-y-3"
    >
      <Field
        label="Nom"
        value={form.fromName}
        onChange={(v) => setForm({ ...form, fromName: v })}
        required
      />
      <Field
        label="Email"
        type="email"
        value={form.fromEmail}
        onChange={(v) => setForm({ ...form, fromEmail: v })}
        required
      />
      <Field
        label="Téléphone (optionnel)"
        type="tel"
        value={form.fromPhone}
        onChange={(v) => setForm({ ...form, fromPhone: v })}
      />
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
          Message
        </label>
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          required
          rows={5}
          className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Envoyer le message"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
        {label}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// LocationMap
// Affiche la position du bien :
//  - iframe OpenStreetMap (gratuit, pas d'API key) avec un marqueur centré
//  - Lien externe vers Google Maps (Streetview/itinéraire)
// On calcule une bbox autour du point (~ ±0.005°, soit ~500m) pour cadrer la vue.
// -------------------------------------------------------------------------------------------------
function LocationMap({
  lat,
  lng,
  title,
}: {
  lat: number;
  lng: number;
  title: string;
}) {
  const delta = 0.005; // demi-côté de la bbox en degrés (~500m)
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
  const osmSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${lat},${lng}`;
  const gmapsHref = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xl font-semibold">Localisation</h2>
        <a
          href={gmapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-brand-700 hover:text-accent-500"
        >
          Ouvrir dans Google Maps ↗
        </a>
      </div>
      <div className="overflow-hidden rounded-2xl border border-brand-200">
        <iframe
          src={osmSrc}
          title={`Carte — ${title}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-80 w-full"
        />
      </div>
      <p className="mt-2 text-xs text-brand-700/60">
        Coordonnées : {lat.toFixed(6)}, {lng.toFixed(6)}
      </p>
    </section>
  );
}

// -------------------------------------------------------------------------------------------------
// Hook : `useTrackPageView`
// Enregistre côté Convex un évènement "view" dès que l'annonce est consultée.
// Si l'URL contient `utm_source`, on enregistre AUSSI un `share_click` (= preuve
// qu'un lien partagé a généré du trafic — utile pour le dashboard ambassadeur).
//
// Mécaniques :
//   - Dédup côté serveur via `sessionHash` (généré localStorage, expire avec
//     l'effacement du storage). Évite de compter chaque rafraîchissement.
//   - `device` parsé depuis `navigator.userAgent` (heuristique simple).
//   - Tous les appels sont fire-and-forget : on n'attend rien et on swallow
//     les erreurs (pas de toast/blocage UX si l'API est lente ou indispo).
// -------------------------------------------------------------------------------------------------
function useTrackPageView(opts: {
  propertyId: Id<"properties">;
  refUserId?: string;
  utmSource?: string;
  // Géolocalisation Vercel : présente seulement au premier rendu SSR
  country?: string;
  city?: string;
}) {
  const recordEvent = useMutation(api.events.record);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1) sessionHash anonyme stocké en localStorage. Sert à dédupliquer côté
    //    serveur sans dépendre de cookies tiers / IP. Si l'user vide son storage,
    //    il est considéré comme nouveau visiteur — c'est OK pour Phase 1.
    const SESSION_KEY = "immobiliare_session_hash";
    let sessionHash = window.localStorage.getItem(SESSION_KEY) ?? undefined;
    if (!sessionHash) {
      sessionHash =
        // crypto.randomUUID est dispo sur tous les browsers modernes en HTTPS
        (window.crypto as any)?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(SESSION_KEY, sessionHash);
    }

    // 2) Détection device basée sur le UA — précision suffisante pour analytics
    const ua = navigator.userAgent;
    const device = /mobile|android|iphone/i.test(ua)
      ? "mobile"
      : /tablet|ipad/i.test(ua)
        ? "tablet"
        : "desktop";

    // 2bis) Classification du HTTP Referer en bucket sémantique (Phase 2).
    // - "direct" si document.referrer est vide
    // - "internal" si la visite vient d'une autre page osy-immo.com
    // - "google" / "bing" / etc. pour les moteurs de recherche connus
    // - "external" pour tout autre site
    // Voir src/lib/referrer.ts pour la liste exhaustive et les patterns.
    const referrerSource = classifyReferrer(
      document.referrer,
      window.location.origin
    );

    // 3) Event "view" — toujours envoyé, enrichi avec géo + referrer si dispo
    recordEvent({
      propertyId: opts.propertyId,
      type: "view",
      refUserId: opts.refUserId,
      utmSource: opts.utmSource,
      referrerSource,
      country: opts.country,
      city: opts.city,
      device,
      sessionHash,
    }).catch(() => {});

    // 4) Event "share_click" si l'arrivée vient d'un lien partagé
    //    (= l'URL portait `utm_source`). Permet de mesurer le ROI des partages.
    if (opts.utmSource) {
      recordEvent({
        propertyId: opts.propertyId,
        type: "share_click",
        refUserId: opts.refUserId,
        utmSource: opts.utmSource,
        country: opts.country,
        city: opts.city,
        device,
        sessionHash,
      }).catch(() => {});
    }
    // Les deps changent rarement ; on relance seulement si on change d'annonce
    // ou si les params utm changent. Pas besoin d'inclure `recordEvent`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opts.propertyId,
    opts.refUserId,
    opts.utmSource,
    opts.country,
    opts.city,
  ]);
}

// -------------------------------------------------------------------------------------------------
// SellerMiniCard : présentation publique succincte du propriétaire de l'annonce.
//
// Affichée dans l'aside contact uniquement quand le visiteur N'EST PAS l'owner
// (l'owner voit son propre OwnerPanel à la place). Bâtit la confiance avant
// d'envoyer un message.
//
// Données : query publique `users.getPublicProfile` qui filtre PII côté
// serveur (jamais email/phone retournés). Cas "profil pas rempli" : on
// affiche juste avatar par défaut + pseudo, sans bloc bio fantôme.
// -------------------------------------------------------------------------------------------------
function SellerMiniCard({ ownerId }: { ownerId: string }) {
  const profile = useQuery(api.users.getPublicProfile, { userId: ownerId });

  // Loading skeleton minimal pendant la query
  if (profile === undefined) {
    return (
      <div className="mb-4 flex items-center gap-3 border-b border-brand-100 pb-4">
        <div className="h-12 w-12 shrink-0 shimmer rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 shimmer rounded" />
          <div className="h-3 w-48 max-w-full shimmer rounded" />
        </div>
      </div>
    );
  }
  // Profil supprimé entre temps — on n'affiche rien (le ContactArea reste OK)
  if (profile === null) return null;

  const displayName = profile.name?.trim() || "Vendeur Osy-Immo";
  // Initiales pour l'avatar fallback (max 2 lettres)
  const initials =
    displayName
      .split(/\s+/)
      .map((w: string) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="mb-4 flex items-start gap-3 border-b border-brand-100 pb-4">
      {/* Avatar — photo si dispo, sinon initiales sur fond brand */}
      {profile.image ? (
        <img
          src={profile.image}
          alt=""
          aria-hidden
          className="h-12 w-12 shrink-0 rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-200 text-sm font-semibold text-brand-700"
        >
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-brand-900">{displayName}</p>
        {/* Bio optionnelle — truncate à 2 lignes via line-clamp.
            Si pas de bio, on n'affiche pas de bloc vide. */}
        {profile.bio && profile.bio.trim().length > 0 && (
          <p className="mt-0.5 line-clamp-2 text-xs text-brand-700/70">
            {profile.bio}
          </p>
        )}
      </div>
    </div>
  );
}
