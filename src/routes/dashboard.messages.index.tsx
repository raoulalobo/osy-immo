// src/routes/dashboard.messages.index.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Liste de toutes les conversations de l'utilisateur (côté acheteur ET propriétaire).
//
//        URL : `/dashboard/messages`
//
// Affiche pour chaque conversation :
//   - Miniature de l'annonce (1re image ou placeholder)
//   - Titre de l'annonce
//   - Rôle de l'utilisateur dans la conversation (Acheteur / Propriétaire)
//   - Aperçu du dernier message
//   - Badge nombre de messages non lus si > 0
//   - Date relative ("il y a 3 min", "hier", "2026-05-15")
//
// Auth : route protégée. Loader retourne `null` si pas connecté → redirige.
// Réactif : `useQuery` met à jour la liste instantanément quand un nouveau
// message arrive (compteur unread se met à jour, ordre change).
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Inbox, MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { Breadcrumb } from "~/components/Breadcrumb";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/dashboard/messages/")({
  component: MessagesListPage,
});

function MessagesListPage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const conversations = useQuery(
    api.messages.listMine,
    session ? {} : "skip"
  );

  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: "/auth/login" });
    }
  }, [isPending, session, navigate]);

  // Skeleton liste pendant la résolution session — réutilise le composant local
  // ConversationListSkeleton déjà utilisé pour le chargement de la query.
  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 h-8 w-32 shimmer rounded" />
        <ConversationListSkeleton />
      </div>
    );
  }
  if (!session) return null;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Mon espace", to: "/dashboard" },
          { label: "Messages" },
        ]}
      />
      <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-brand-700/70">
          Tes échanges avec les propriétaires et les acheteurs intéressés.
        </p>
      </div>

      {conversations === undefined ? (
        <ConversationListSkeleton />
      ) : conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <ConversationRow key={c._id} conversation={c} />
          ))}
        </ul>
      )}
      </div>
    </>
  );
}

// -------------------------------------------------------------------------------------------------

function ConversationRow({
  conversation,
}: {
  conversation: NonNullable<
    Awaited<ReturnType<typeof useQuery<typeof api.messages.listMine>>>
  >[number];
}) {
  const isUnread = conversation.unread > 0;
  return (
    <li>
      <Link
        to="/dashboard/messages/$id"
        params={{ id: conversation._id }}
        className={cn(
          "group flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft transition hover:bg-brand-50",
          isUnread && "ring-1 ring-accent-500/30"
        )}
      >
        {/* Vignette annonce — image principale ou placeholder dégradé */}
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-brand-100">
          {conversation.propertyImage ? (
            <img
              src={conversation.propertyImage}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-brand-700/40">
              <MessageSquare className="h-5 w-5" />
            </div>
          )}
        </div>

        {/* Contenu */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("truncate font-medium", isUnread && "text-brand-900")}>
              {conversation.propertyTitle}
            </p>
            <span className="shrink-0 text-xs text-brand-700/60">
              {formatRelativeTime(conversation.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "truncate text-sm",
                isUnread
                  ? "font-medium text-brand-700"
                  : "text-brand-700/70"
              )}
            >
              {conversation.lastMessagePreview}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <RoleBadge role={conversation.role} />
              {isUnread && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white">
                  {conversation.unread}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

// -------------------------------------------------------------------------------------------------
// Helpers visuels
// -------------------------------------------------------------------------------------------------

function RoleBadge({ role }: { role: "owner" | "buyer" }) {
  // Visualise le rôle pour distinguer rapidement les conversations
  // dans lesquelles je vends vs celles dans lesquelles j'achète.
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
        role === "owner"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-brand-100 text-brand-700"
      )}
    >
      {role === "owner" ? "Vendeur" : "Acheteur"}
    </span>
  );
}

function ConversationListSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="flex h-20 shimmer rounded-2xl p-3 shadow-soft"
        />
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center">
      <Inbox className="mx-auto h-10 w-10 text-brand-700/40" />
      <p className="mt-3 font-medium">Aucun message pour l'instant.</p>
      <p className="mt-1 text-sm text-brand-700/70">
        Contacte un propriétaire depuis une annonce pour démarrer une conversation,
        ou attends qu'un acheteur t'écrive.
      </p>
      <Link
        to="/properties"
        className="mt-4 inline-block rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
      >
        Parcourir les annonces
      </Link>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Format temps relatif compact pour les listes ("3 min", "hier", "2026-05-15")
// -------------------------------------------------------------------------------------------------
function formatRelativeTime(ts: number): string {
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return "à l'instant";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "hier";
  if (diffD < 7) return `${diffD} j`;
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}
