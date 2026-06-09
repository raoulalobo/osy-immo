// src/routes/dashboard.stats.$id.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Page détaillée des statistiques d'une annonce — accessible depuis le tableau
//        du dashboard via un lien "📊 Stats".
//
//        URL : `/dashboard/stats/<propertyId>`
//
// Affiche :
//   - En-tête : titre annonce + prix + lien retour
//   - 4 KPI : Vues / Favoris / Demandes / Partages sur 30j
//   - Funnel conversion : vue → favori → contact (avec taux)
//   - Bar chart vues/jour sur 30 jours (SVG natif, sans librairie)
//   - Breakdown sources / pays / villes / devices
//
// Sécurité : la query `events:statsForProperty` est owner-only — un user qui tente
//            d'accéder aux stats d'une annonce qu'il ne possède pas reçoit null.
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Eye,
  Heart,
  Mail,
  MapPin,
  Share2,
  Smartphone,
} from "lucide-react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Breadcrumb } from "~/components/Breadcrumb";
import { authClient } from "~/lib/auth-client";
import { useMediaQuery } from "~/lib/use-media-query";
import { cn, formatPrice } from "~/lib/utils";

export const Route = createFileRoute("/dashboard/stats/$id")({
  component: StatsPage,
});

// Codes pays ISO → emoji drapeau (table partielle, focus pays cibles).
// Sert à humaniser le breakdown geo dans la UI.
const COUNTRY_FLAGS: Record<string, string> = {
  CM: "🇨🇲", FR: "🇫🇷", BE: "🇧🇪", CA: "🇨🇦", CI: "🇨🇮",
  SN: "🇸🇳", US: "🇺🇸", GB: "🇬🇧", DE: "🇩🇪", IT: "🇮🇹",
  ES: "🇪🇸", PT: "🇵🇹", NL: "🇳🇱", MA: "🇲🇦", DZ: "🇩🇿",
  TN: "🇹🇳", CD: "🇨🇩", CG: "🇨🇬", GA: "🇬🇦", TG: "🇹🇬",
};

function StatsPage() {
  const { id } = Route.useParams();
  const propertyId = id as Id<"properties">;
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  const property = useQuery(api.properties.get, { id: propertyId });
  // Sur mobile (< 640 px), on demande seulement 14 jours pour que le bar chart
  // SVG tienne dans le viewport sans scroll horizontal interne. Sur tablet+ on
  // garde 30 jours pour la vue d'ensemble complète.
  const isCompact = useMediaQuery("(max-width: 640px)");
  const daysToShow = isCompact ? 14 : 30;
  const stats = useQuery(
    api.events.statsForProperty,
    session ? { propertyId, days: daysToShow } : "skip"
  );

  // Redirection si non connecté
  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: "/auth/login" });
    }
  }, [isPending, session, navigate]);

  // Skeleton stats pendant la résolution session — identique au skeleton
  // déjà utilisé pour le cas "stats Convex en cours" plus bas (cohérence).
  if (isPending) return <StatsPageSkeleton />;
  if (!session) return null;

  // stats === null : l'utilisateur n'est pas propriétaire de l'annonce
  if (stats === null) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Accès refusé</h1>
        <p className="mt-2 text-brand-700/70">
          Cette annonce n'existe pas, ou tu n'en es pas le propriétaire.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-block rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
        >
          Retour au dashboard
        </Link>
      </div>
    );
  }

  // Property OU stats en cours de fetch — même skeleton qu'isPending.
  if (property === undefined || stats === undefined) {
    return <StatsPageSkeleton />;
  }
  if (property === null) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Annonce introuvable</h1>
      </div>
    );
  }

  const views = stats.counts.view ?? 0;
  const favs = stats.counts.favorite ?? 0;
  const contacts = stats.counts.contact ?? 0;
  const shares = stats.counts.share ?? 0;
  const shareClicks = stats.counts.share_click ?? 0;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Mon espace", to: "/dashboard" },
          { label: `Statistiques « ${property.title} »`, title: property.title },
        ]}
      />
      <div className="mx-auto max-w-6xl px-6 py-10">
      {/* En-tête : retour + titre */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-brand-700/70 hover:text-accent-500"
      >
        <ArrowLeft className="h-4 w-4" /> Retour au tableau
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Statistiques · {property.title}
      </h1>
      <p className="mt-1 text-brand-700/70">
        {formatPrice(property.price)}
        {property.listingType === "rent" && (
          <span className="text-brand-700/60"> /mois</span>
        )}{" "}
        · {property.city}, {property.country}
      </p>
      <p className="mt-1 text-xs text-brand-700/60">
        Période : {daysToShow} derniers jours
      </p>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          icon={<Eye className="h-4 w-4" />}
          label="Vues"
          value={views}
          color="text-brand-700"
        />
        <KpiCard
          icon={<Heart className="h-4 w-4" />}
          label="Ajouts favoris"
          value={favs}
          color="text-pink-600"
        />
        <KpiCard
          icon={<Mail className="h-4 w-4" />}
          label="Demandes reçues"
          value={contacts}
          color="text-accent-600"
        />
        <KpiCard
          icon={<Share2 className="h-4 w-4" />}
          label="Partages"
          value={shares}
          color="text-emerald-600"
          sub={
            shareClicks > 0
              ? `${shareClicks} clics générés par les partages`
              : undefined
          }
        />
      </div>

      {/* Funnel conversion */}
      {views > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Entonnoir de conversion</h2>
          <p className="text-sm text-brand-700/70">
            De la vue à la prise de contact effective.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FunnelStep
              label="Vue de l'annonce"
              count={views}
              ratio={1}
            />
            <FunnelStep
              label="Ajout en favori"
              count={favs}
              ratio={favs / views}
            />
            <FunnelStep
              label="Prise de contact"
              count={contacts}
              ratio={contacts / views}
            />
          </div>
        </section>
      )}

      {/* Bar chart vues/jour */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Vues par jour</h2>
        <p className="text-sm text-brand-700/70">
          Évolution des consultations sur {daysToShow} jours.
        </p>
        <DailyViewsChart data={stats.dailyViews} />
      </section>

      {/* Breakdowns en 2x2 grille : Sources / Pays / Villes / Devices */}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="Canaux d'arrivée"
          subtitle="D'où viennent tes visiteurs"
          data={stats.sources}
          colorMap={{
            // Sources taggées (utm_source posé par ShareButton)
            whatsapp: "bg-[#25D366]",
            copy: "bg-brand-500",
            native: "bg-brand-700",
            facebook: "bg-[#1877F2]",
            // Sources inférées depuis le Referer (Phase 2)
            google: "bg-[#4285F4]",
            bing: "bg-[#0078D4]",
            duckduckgo: "bg-[#DE5833]",
            qwant: "bg-[#3E20BF]",
            yahoo: "bg-[#6001D2]",
            ecosia: "bg-[#1F8C3A]",
            brave: "bg-[#FB542B]",
            internal: "bg-emerald-500",
            external: "bg-amber-500",
            direct: "bg-brand-300",
          }}
          labelMap={{
            whatsapp: "WhatsApp",
            copy: "Lien copié",
            native: "Partage natif",
            facebook: "Facebook",
            google: "Google",
            bing: "Bing",
            duckduckgo: "DuckDuckGo",
            qwant: "Qwant",
            yahoo: "Yahoo",
            ecosia: "Ecosia",
            brave: "Brave",
            internal: "Interne",
            external: "Autre site",
            direct: "Direct (URL tapée / bookmark)",
          }}
        />

        <BreakdownCard
          title="Pays"
          subtitle="Géolocalisation approximative"
          data={stats.countries}
          icon={<MapPin className="h-4 w-4" />}
          formatLabel={(code) => `${COUNTRY_FLAGS[code] ?? "🌍"} ${code}`}
        />

        <BreakdownCard
          title="Villes"
          subtitle="Top villes des visiteurs"
          data={stats.cities}
          icon={<MapPin className="h-4 w-4" />}
        />

        <BreakdownCard
          title="Appareils"
          subtitle="Mobile vs desktop vs tablette"
          data={stats.devices}
          icon={<Smartphone className="h-4 w-4" />}
          labelMap={{
            mobile: "📱 Mobile",
            desktop: "💻 Desktop",
            tablet: "📟 Tablette",
          }}
        />
      </div>
      </div>
    </>
  );
}

// -------------------------------------------------------------------------------------------------
// Composants internes
// -------------------------------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  value,
  sub,
  color = "text-brand-700",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft">
      <div className={cn("flex items-center gap-2", color, "/70 text-brand-700/70")}>
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn("mt-1 text-3xl font-semibold", color)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-brand-700/60">{sub}</p>}
    </div>
  );
}

function FunnelStep({
  label,
  count,
  ratio,
}: {
  label: string;
  count: number;
  ratio: number;
}) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-brand-700/70">{label}</p>
        <p className="text-2xl font-semibold text-brand-700">{count}</p>
      </div>
      {/* Barre de progression visuelle pour comparer le ratio */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-100">
        <div
          className="h-full bg-accent-500 transition-[width] duration-500 [transition-timing-function:var(--ease-swift-out)]"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-brand-700/60">{pct}% des vues</p>
    </div>
  );
}

/**
 * Bar chart simple en SVG : pas de lib graphique externe.
 * Chaque barre = nombre de vues d'un jour ; la hauteur est normalisée
 * par rapport au max de la série.
 */
function DailyViewsChart({
  data,
}: {
  data: { day: string; count: number }[];
}) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.count), 1);
  const w = 800;
  const h = 200;
  const padding = { top: 10, right: 10, bottom: 30, left: 30 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const barW = chartW / data.length;

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl bg-white p-4 shadow-soft">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label="Graphique en barres des vues par jour"
      >
        {/* Lignes de graduation horizontales — 4 paliers (0%, 33%, 66%, 100%) */}
        {[0, 0.33, 0.66, 1].map((p) => {
          const y = padding.top + chartH * (1 - p);
          return (
            <g key={p}>
              <line
                x1={padding.left}
                x2={w - padding.right}
                y1={y}
                y2={y}
                stroke="#e7e8ea"
                strokeWidth="1"
              />
              <text
                x={padding.left - 6}
                y={y + 4}
                fontSize="10"
                fill="#64748b"
                textAnchor="end"
              >
                {Math.round(max * p)}
              </text>
            </g>
          );
        })}

        {/* Barres */}
        {data.map((d, i) => {
          const x = padding.left + i * barW + barW * 0.15;
          const bw = barW * 0.7;
          const bh = (d.count / max) * chartH;
          const y = padding.top + chartH - bh;
          // On affiche le label "jour" toutes les 5 barres pour ne pas surcharger
          const showLabel = i === 0 || i === data.length - 1 || i % 5 === 0;
          // Récupère juste "DD" depuis "YYYY-MM-DD"
          const dayLabel = d.day.slice(-2);
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={y}
                width={bw}
                height={bh}
                rx="2"
                className="fill-brand-500"
              >
                <title>
                  {d.day} : {d.count} vue{d.count > 1 ? "s" : ""}
                </title>
              </rect>
              {showLabel && (
                <text
                  x={x + bw / 2}
                  y={h - padding.bottom + 14}
                  fontSize="10"
                  fill="#64748b"
                  textAnchor="middle"
                >
                  {dayLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Carte breakdown générique : prend une map { clé → count } et affiche
 * une liste triée avec une mini-barre de progression visuelle.
 */
function BreakdownCard({
  title,
  subtitle,
  data,
  icon,
  colorMap,
  labelMap,
  formatLabel,
}: {
  title: string;
  subtitle?: string;
  // `data` est un tableau [clé, count] (et non une map) — cf. events.ts :
  // les clés non-ASCII (villes accentuées) ne peuvent pas être des noms de
  // champs Convex, on renvoie donc des tableaux depuis le backend.
  data: [string, number][];
  icon?: React.ReactNode;
  colorMap?: Record<string, string>;
  labelMap?: Record<string, string>;
  formatLabel?: (key: string) => string;
}) {
  const entries = data
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-soft">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      {subtitle && (
        <p className="text-sm text-brand-700/60">{subtitle}</p>
      )}
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-brand-700/40">
          Aucune donnée pour l'instant.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map(([key, count]) => {
            const label = formatLabel
              ? formatLabel(key)
              : (labelMap?.[key] ?? key);
            const pct = (count / max) * 100;
            const barClass = colorMap?.[key] ?? "bg-brand-500";
            return (
              <li key={key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-brand-700">{label}</span>
                  <span className="text-brand-700/70">{count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-100">
                  <div
                    className={cn("h-full transition-[width] duration-500 [transition-timing-function:var(--ease-swift-out)]", barClass)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Skeleton local pour la page stats — utilisé pour les 2 phases de chargement
 * (session pending + property/stats Convex en cours). Mime : titre + 4 KPI cards.
 * Volontairement local (pas dans Skeletons.tsx) car spécifique à cette page.
 */
function StatsPageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="h-8 w-64 max-w-full shimmer rounded" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 shimmer rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
