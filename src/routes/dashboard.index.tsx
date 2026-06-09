// src/routes/dashboard.index.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Espace propriétaire — page index `/dashboard/`. Liste les annonces de l'utilisateur,
//        ses demandes reçues, et permet de créer/publier/supprimer des annonces.
//
// Note : Renommé en `.index.tsx` pour que `dashboard.new.tsx` (= `/dashboard/new`) ne soit pas
//        traité comme un enfant nécessitant un `<Outlet/>` parent.
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  BarChart3,
  Eye,
  Facebook,
  Instagram,
  Music2,
  Plus,
  RefreshCw,
  Rocket,
  Share2,
  Trash2,
  TrendingUp,
} from "lucide-react";
// useAction = pour appeler des actions Convex (mutation + side-effect HTTP)
// vs useMutation qui ne fait que des écritures DB.
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { Breadcrumb } from "~/components/Breadcrumb";
import { ShareButton } from "~/components/ShareButton";
import { Select, type SelectOption } from "~/components/Select";
import { DashboardSkeleton } from "~/components/Skeletons";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { authClient } from "~/lib/auth-client";
import { cn, formatPrice } from "~/lib/utils";

// Options du dropdown de statut — libellés FR, traduits depuis les valeurs
// stockées en base (draft/active/sold/rented/archived).
const STATUS_OPTIONS: SelectOption[] = [
  { value: "draft", label: "Brouillon" },
  { value: "active", label: "Publiée" },
  { value: "sold", label: "Vendue" },
  { value: "rented", label: "Louée" },
  { value: "archived", label: "Archivée" },
];

// Type retourné par api.events.statsForOwner — facilite le typage TS sans
// devoir importer le retour de la query (qui est inféré côté Convex).
type StatsForProperty = {
  counts: Record<string, number>;
  // Ventilations en tableaux [clé, count] (cf. events.ts) — les clés non-ASCII
  // (villes accentuées) ne peuvent pas être des noms de champs Convex.
  sources: [string, number][];
  devices: [string, number][];
  dailyViews: { day: string; count: number }[];
};

// Badge couleur par canal de partage — permet à l'œil de scanner rapidement
// d'où vient le trafic d'une annonce.
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  // ─── Sources TAGGÉES (utm_source posé par ShareButton) ──────────────────
  whatsapp: { label: "WhatsApp", color: "bg-[#25D366] text-white" },
  copy: { label: "Lien copié", color: "bg-brand-500 text-white" },
  native: { label: "Partage natif", color: "bg-brand-700 text-white" },
  facebook: { label: "Facebook", color: "bg-[#1877F2] text-white" },
  // ─── Sources INFÉRÉES depuis le HTTP Referer (classifyReferrer) ─────────
  // Moteurs de recherche aux couleurs de marque
  google: { label: "Google", color: "bg-[#4285F4] text-white" },
  bing: { label: "Bing", color: "bg-[#0078D4] text-white" },
  duckduckgo: { label: "DuckDuckGo", color: "bg-[#DE5833] text-white" },
  qwant: { label: "Qwant", color: "bg-[#3E20BF] text-white" },
  yahoo: { label: "Yahoo", color: "bg-[#6001D2] text-white" },
  ecosia: { label: "Ecosia", color: "bg-[#1F8C3A] text-white" },
  brave: { label: "Brave", color: "bg-[#FB542B] text-white" },
  // Navigation interne (clic depuis /properties, /favorites, etc.)
  internal: { label: "Interne", color: "bg-emerald-100 text-emerald-700" },
  // Site externe non reconnu (LinkedIn, Twitter, un blog…)
  external: { label: "Autre site", color: "bg-amber-100 text-amber-700" },
  // Direct PUR : aucun Referer (URL tapée, bookmark, lien collé direct)
  direct: { label: "Direct", color: "bg-brand-100 text-brand-700" },
};

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const myProps = useQuery(api.properties.listByOwner, session ? {} : "skip");
  const inquiries = useQuery(api.inquiries.listForOwner, session ? {} : "skip");
  // Stats agrégées par annonce sur les 7 derniers jours — chargées en parallèle
  // de la liste des annonces. Map id → { counts, sources, devices, dailyViews }.
  const stats = useQuery(api.events.statsForOwner, session ? { days: 7 } : "skip");
  // Stats du propriétaire en tant que partageur — combien de clics ses liens partagés
  // ont généré (sur 30 jours pour avoir une vue plus large).
  const referrerStats = useQuery(api.events.statsForReferrer, session ? { days: 30 } : "skip");
  // Map des publications sociales (Zernio) par propertyId — la DERNIÈRE tentative
  // par annonce. Si retry il y a, on voit l'état le plus récent.
  // Format : { [propertyId]: { status, platformResults, ... } }
  // Annonce absente du map = jamais publiée sur les réseaux (jamais passée active
  // OU draft initial sans hook).
  const socialPosts = useQuery(
    api.social.listSocialPostsForOwner,
    session ? {} : "skip"
  );

  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: "/auth/login" });
    }
  }, [isPending, session, navigate]);

  // Skeleton mimétique pendant la résolution BetterAuth (header + 3 KPIs +
  // table 5 lignes shimmer). Évite le flash de texte vide.
  if (isPending) return <DashboardSkeleton />;
  if (!session) return null;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Mon espace" },
        ]}
      />
      <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mon espace</h1>
          <p className="mt-1 text-brand-700/70">
            Bonjour {session.user.name ?? session.user.email} 👋
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Lien profil — secondaire, en outline pour ne pas concurrencer le
              CTA principal "Publier une annonce" */}
          <Link
            to="/dashboard/profile"
            className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
          >
            Modifier mon profil
          </Link>
          <Link
            to="/dashboard/new"
            className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
          >
            <Plus className="h-4 w-4" />
            Publier une annonce
          </Link>
        </div>
      </div>

      {/* Indicateurs globaux : vues totales + impact des partages (30j).
          Toujours visibles même si stats vides — donne un cadre au dashboard. */}
      <OverviewCards stats={stats} referrerStats={referrerStats} />

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Mes annonces</h2>
        {myProps === undefined ? (
          // Skeleton table : 5 lignes shimmer dans une carte blanche — mime
          // la structure réelle du tableau qui apparaîtra ensuite.
          <div className="mt-4 rounded-2xl bg-white p-2 shadow-soft">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="my-1 h-14 shimmer rounded-lg" />
            ))}
          </div>
        ) : myProps.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-brand-200 bg-white p-6 text-center">
            Aucune annonce pour le moment.
          </p>
        ) : (
          // Wrapper en `overflow-x-auto` : le scroll horizontal reste INTERNE
          // au tableau, jamais sur toute la page. `min-w-[860px]` augmenté
          // pour la nouvelle colonne "Réseaux" — 8 colonnes au total.
          <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-soft">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-brand-50 text-brand-700/70">
                <tr>
                  <th className="px-4 py-3 font-medium">Titre</th>
                  <th className="px-4 py-3 font-medium">Ville</th>
                  <th className="px-4 py-3 font-medium">Prix</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Vues 7j</th>
                  <th className="px-4 py-3 font-medium">Sources</th>
                  {/* Nouvelle colonne : badges FB/IG/TikTok par annonce avec
                      statut (published/failed/pending). Cliquable → retry. */}
                  <th className="px-4 py-3 font-medium">Réseaux</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {myProps.map((p) => (
                  <PropertyRow
                    key={p._id}
                    property={p}
                    stats={stats?.[p._id] as StatsForProperty | undefined}
                    socialPost={
                      socialPosts?.[p._id] as SocialPostSummary | undefined
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Demandes reçues</h2>
        {inquiries === undefined ? (
          // Skeleton liste : 3 cards shimmer simulant des inquiries.
          <ul className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="h-24 shimmer rounded-2xl shadow-soft" />
            ))}
          </ul>
        ) : inquiries.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-brand-200 bg-white p-6 text-center">
            Aucune demande pour l'instant.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {inquiries.map((i) => (
              <li
                key={i._id}
                className="rounded-2xl bg-white p-4 shadow-soft"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{i.fromName}</p>
                  <span className="text-xs uppercase tracking-wide text-brand-700/60">
                    {new Date(i._creationTime).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <p className="text-sm text-brand-700/70">{i.fromEmail}{i.fromPhone ? ` · ${i.fromPhone}` : ""}</p>
                <p className="mt-2 whitespace-pre-line text-brand-700/90">{i.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </>
  );
}

function PropertyRow({
  property,
  stats,
  socialPost,
}: {
  property: Doc<"properties">;
  stats: StatsForProperty | undefined;
  socialPost: SocialPostSummary | undefined;
}) {
  const update = useMutation(api.properties.update);
  const remove = useMutation(api.properties.remove);
  // useAction (vs useMutation) car retryFailedPlatforms fait des appels HTTP
  // externes (Zernio) en plus de mutations DB.
  const retryFailedPlatforms = useAction(api.social.retryFailedPlatforms);
  const views = stats?.counts?.view ?? 0;
  // États locaux pour désactiver les boutons pendant l'opération
  // (évite double-clic + feedback visuel via opacity-60).
  const [publishing, setPublishing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const isDraft = property.status === "draft";

  /**
   * Bascule l'annonce de "draft" → "active" via la mutation update.
   * Côté Convex (properties.ts:258-277), ce premier passage déclenche aussi
   * `publishedAt = Date.now()` + le hook social Zernio (Facebook/Instagram).
   */
  async function publish() {
    setPublishing(true);
    try {
      await update({ id: property._id, patch: { status: "active" } });
      toast.success("Annonce publiée — visible sur /properties");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la publication");
    } finally {
      setPublishing(false);
    }
  }

  /**
   * Relance la publication sur les plateformes en échec (FB/IG/TikTok).
   * Côté serveur : retryFailedPlatforms vérifie l'owner, filtre les `failed`
   * dans platformResults, et re-poste UNIQUEMENT sur ces plateformes.
   * Après 15s, reconcileSocialPost met à jour le statut réel.
   */
  async function retrySocial() {
    setRetrying(true);
    try {
      const r = await retryFailedPlatforms({ propertyId: property._id });
      if ("error" in r) {
        toast.error(r.error);
      } else if ("success" in r) {
        toast.success(
          `Retry lancé pour ${r.retriedPlatforms.join(", ")} — résultat dans ~15 s`
        );
      } else {
        // Cas "aucune plateforme à retenter" — message neutre.
        toast(r.message);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors du retry");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <tr className="border-t border-brand-100">
      <td className="px-4 py-3">
        <Link
          to="/properties/$id"
          params={{ id: property._id }}
          className="font-medium hover:text-accent-500"
        >
          {property.title}
        </Link>
      </td>
      <td className="px-4 py-3 text-brand-700/80">{property.city}</td>
      <td className="px-4 py-3">{formatPrice(property.price)}</td>
      <td className="px-4 py-3">
        {/* Brouillon : badge jaune en lecture seule — le call-to-action est
            le bouton "Publier" dédié dans la colonne Actions (UX plus claire
            qu'un dropdown discret pour cette transition critique).
            Autres statuts : dropdown Select pour transitions secondaires
            (Vendue / Louée / Archivée).
            detached=true → popover en `position: fixed` pour ne pas être
            coupé par le `<td>` parent. */}
        {isDraft ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Brouillon
          </span>
        ) : (
          <Select
            value={property.status}
            onChange={async (v) => {
              await update({
                id: property._id,
                patch: { status: v as any },
              });
              toast.success("Statut mis à jour");
            }}
            options={STATUS_OPTIONS}
            variant="ghost"
            detached
            ariaLabel="Statut de l'annonce"
          />
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
            <Eye className="h-3.5 w-3.5" />
            {views}
          </span>
          {/* Badge "Hot" (≥50 vues 7j) ou "Tendance" (≥10) — repère visuel
              pour identifier rapidement les annonces qui performent. */}
          {views >= 50 ? (
            <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              🔥 Hot
            </span>
          ) : views >= 10 ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
              📈 Tendance
            </span>
          ) : null}
          {stats && stats.dailyViews.length > 0 && (
            <Sparkline data={stats.dailyViews.map((d) => d.count)} />
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <SourceBadges sources={stats?.sources ?? []} />
      </td>
      <td className="px-4 py-3">
        {/* Badges réseaux : un pill par plateforme tentée (FB/IG/TikTok)
            avec sa couleur de statut (vert published, rouge failed, gris
            pending). Bouton 🔁 Retry visible si au moins une plateforme
            est en `failed`. */}
        <SocialBadges
          socialPost={socialPost}
          onRetry={retrySocial}
          retrying={retrying}
        />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          {/* Bouton "Publier" — visible UNIQUEMENT pour les brouillons.
              C'est le call-to-action principal : sans ça, l'annonce reste
              invisible sur /properties (cf. properties.list qui ne renvoie
              que status="active"). Style "accent" pour qu'il saute aux yeux
              parmi les icônes secondaires. */}
          {isDraft && (
            <button
              type="button"
              onClick={publish}
              disabled={publishing}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-soft hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
              aria-label="Publier l'annonce"
            >
              <Rocket className="h-3.5 w-3.5" />
              {publishing ? "Publication…" : "Publier"}
            </button>
          )}
          {/* Lien stats détaillées — graphique 30j + funnel + breakdown geo */}
          <Link
            to="/dashboard/stats/$id"
            params={{ id: property._id }}
            aria-label="Voir les statistiques détaillées"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-brand-700/60 hover:bg-brand-100 hover:text-brand-700"
          >
            <BarChart3 className="h-4 w-4" />
          </Link>
          {/* Bouton partage compact — copie le lien (desktop) ou ouvre la
              feuille système de partage (mobile). Voir ShareButton.tsx. */}
          <ShareButton property={property} variant="compact" />
          <button
            type="button"
            onClick={async () => {
              if (!confirm("Supprimer cette annonce ?")) return;
              await remove({ id: property._id });
              toast.success("Annonce supprimée");
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-brand-700/60 hover:bg-red-50 hover:text-red-600"
            aria-label="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// -------------------------------------------------------------------------------------------------
// OverviewCards : 3 KPI synthétiques en haut du dashboard
//   - Total vues 7j (toutes annonces confondues)
//   - Partages générés 7j (clic sur "Partager")
//   - Clics issus de MES partages sur 30j (avec ?ref=monId)
// -------------------------------------------------------------------------------------------------
function OverviewCards({
  stats,
  referrerStats,
}: {
  stats: Record<string, StatsForProperty> | undefined;
  referrerStats: { counts: Record<string, number>; totalEvents: number } | null | undefined;
}) {
  // Somme des vues toutes annonces
  const totalViews = stats
    ? Object.values(stats).reduce((sum, s) => sum + (s.counts.view ?? 0), 0)
    : 0;
  // Somme des partages générés (boutons cliqués)
  const totalShares = stats
    ? Object.values(stats).reduce((sum, s) => sum + (s.counts.share ?? 0), 0)
    : 0;
  // Clics générés par MES liens partagés
  const myReferralClicks = referrerStats?.counts?.share_click ?? 0;

  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard
        icon={<Eye className="h-4 w-4" />}
        label="Vues sur mes annonces"
        value={totalViews}
        sub="sur 7 jours"
      />
      <KpiCard
        icon={<Share2 className="h-4 w-4" />}
        label="Partages effectués"
        value={totalShares}
        sub="sur 7 jours"
      />
      <KpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="Clics issus de mes partages"
        value={myReferralClicks}
        sub="sur 30 jours"
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2 text-brand-700/70">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-brand-700">{value}</p>
      <p className="text-xs text-brand-700/60">{sub}</p>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Sparkline : mini graphique inline sans librairie externe.
// Trace une polyline SVG sur l'array de valeurs (vues/jour sur N jours).
// Reste lisible même avec 7 points et seulement ~80px de large.
// -------------------------------------------------------------------------------------------------
function Sparkline({ data }: { data: number[] }) {
  if (data.length === 0) return null;
  const w = 80;
  const h = 24;
  const max = Math.max(...data, 1); // évite la division par 0
  // Construit les points "x,y" — équidistants horizontalement, normalisés verticalement
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * w;
      const y = h - (v / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="text-brand-500"
      aria-label="Évolution des vues sur 7 jours"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// -------------------------------------------------------------------------------------------------
// SourceBadges : pills colorées montrant l'origine du trafic d'une annonce.
// Empilées côte à côte, max 3 sources affichées (les plus volumineuses).
// -------------------------------------------------------------------------------------------------
// `sources` est désormais un tableau [canal, count] (et non plus une map) —
// voir events.ts/aggregateEvents : les clés non-ASCII cassaient la sérialisation
// Convex, on renvoie donc des tableaux côté backend.
// -------------------------------------------------------------------------------------------------
// SocialBadges : badges colorés FB/IG/TikTok montrant le statut RÉEL de la
// publication par plateforme (depuis socialPosts.platformResults).
//
// Couleur :
//   - vert (emerald) si plateforme = published
//   - rouge (red) si plateforme = failed
//   - gris (brand-100) si plateforme en pending / pas dans platformResults
//
// Bouton 🔁 Retry : affiché à droite si au moins une plateforme est failed.
// Appelle l'action retryFailedPlatforms côté Convex (owner-only).
// -------------------------------------------------------------------------------------------------
type SocialPostSummary = {
  _id: Id<"socialPosts">;
  status: "pending" | "published" | "partial" | "failed" | "skipped_no_images";
  platforms: string[];
  platformResults: Array<{
    platform: string;
    status: string;
    platformPostUrl?: string;
    platformPostId?: string;
    errorMessage?: string;
  }>;
  zernioPostId?: string;
  errorMessage?: string;
  _creationTime: number;
};

// Métadonnées d'affichage par plateforme : icône lucide + couleur de base
// (utilisée comme couleur de marque quand published).
const PLATFORM_META: Record<
  string,
  { label: string; Icon: React.ComponentType<{ className?: string }>; brand: string }
> = {
  facebook: { label: "Facebook", Icon: Facebook, brand: "bg-[#1877F2]" },
  instagram: { label: "Instagram", Icon: Instagram, brand: "bg-[#E4405F]" },
  // TikTok n'a pas d'icône officielle dans lucide-react (la marque restreint
  // l'usage), on prend Music2 comme symbole approximatif.
  tiktok: { label: "TikTok", Icon: Music2, brand: "bg-black" },
};

function SocialBadges({
  socialPost,
  onRetry,
  retrying,
}: {
  socialPost: SocialPostSummary | undefined;
  onRetry: () => void;
  retrying: boolean;
}) {
  // Cas 1 : aucune publication tentée (annonce jamais passée active OU pas
  // de hook). On affiche un tiret discret.
  if (!socialPost) {
    return <span className="text-xs text-brand-700/40">—</span>;
  }

  // Cas 2 : publication skipped car pas d'image valide
  if (socialPost.status === "skipped_no_images") {
    return (
      <span className="text-xs text-brand-700/60">
        ⚠️ pas d'image
      </span>
    );
  }

  // Cas 3 : on a des résultats par plateforme → on affiche les badges.
  // Type explicite pour que TS ne réduise pas le type sur la branche fallback
  // (qui n'a pas les champs optionnels platformPostUrl/errorMessage).
  type Result = {
    platform: string;
    status: string;
    platformPostUrl?: string;
    platformPostId?: string;
    errorMessage?: string;
  };
  const results: Result[] =
    socialPost.platformResults.length > 0
      ? socialPost.platformResults
      : // Fallback : si platformResults est vide (publication async pas encore
        // reconciliée), on dérive depuis `platforms` avec status=pending.
        socialPost.platforms.map(
          (p): Result => ({ platform: p, status: "pending" })
        );
  const hasFailed = results.some((r) => r.status === "failed");

  return (
    <div className="flex flex-wrap items-center gap-1">
      {results.map((r) => {
        const meta = PLATFORM_META[r.platform];
        if (!meta) return null;
        const { Icon, label } = meta;
        // Couleurs par statut. Cohérence visuelle avec le reste du dashboard
        // (vert emerald pour succès, rouge pour échec).
        let cls: string;
        let title: string;
        if (r.status === "published") {
          cls = `${meta.brand} text-white`;
          title = `${label} : publié${r.platformPostUrl ? " — " + r.platformPostUrl : ""}`;
        } else if (r.status === "failed") {
          cls = "bg-red-100 text-red-700";
          title = `${label} : échec${r.errorMessage ? " — " + r.errorMessage : ""}`;
        } else {
          cls = "bg-brand-100 text-brand-700/70";
          title = `${label} : en cours…`;
        }
        // Si platformPostUrl est dispo, on en fait un lien externe vers le post.
        // Sinon span statique (cas failed ou pending).
        const content = (
          <>
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{label}</span>
          </>
        );
        const className = cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          cls
        );
        return r.status === "published" && r.platformPostUrl ? (
          <a
            key={r.platform}
            href={r.platformPostUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
            title={title}
          >
            {content}
          </a>
        ) : (
          <span key={r.platform} className={className} title={title}>
            {content}
          </span>
        );
      })}
      {/* Bouton 🔁 Retry : visible UNIQUEMENT si au moins une plateforme est
          en échec. Tooltip explicite via aria-label / title. */}
      {hasFailed && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-label="Réessayer les plateformes en échec"
          title="Réessayer les plateformes en échec"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-brand-700 hover:bg-brand-200 disabled:opacity-60"
        >
          <RefreshCw
            className={cn("h-3 w-3", retrying && "animate-spin")}
          />
        </button>
      )}
    </div>
  );
}

function SourceBadges({ sources }: { sources: [string, number][] }) {
  const entries = sources
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  if (entries.length === 0) {
    return <span className="text-xs text-brand-700/40">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([source, count]) => {
        const meta = SOURCE_LABELS[source] ?? {
          label: source,
          color: "bg-brand-100 text-brand-700",
        };
        return (
          <span
            key={source}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              meta.color
            )}
          >
            {meta.label}
            <span className="opacity-80">{count}</span>
          </span>
        );
      })}
    </div>
  );
}
