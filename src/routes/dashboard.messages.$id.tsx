// src/routes/dashboard.messages.$id.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Vue thread d'une conversation entre acheteur et propriétaire.
//
//        URL : `/dashboard/messages/<conversationId>`
//
// Layout :
//   - En-tête : retour + titre annonce + prix + lien vers la fiche
//   - Body : bulles chat (vert pour MOI, blanc pour l'autre), scroll en bas
//   - Footer : textarea autosizing + bouton "Envoyer"
//
// Auth : owner-only via la query Convex (return null si pas participant).
// Auto-mark-read : on appelle `markRead` au mount + à chaque nouveau message
//                  reçu pour que le compteur unread se réinitialise en direct.
// Réactivité : `useQuery` met à jour automatiquement quand l'autre côté envoie
//              un nouveau message — pas besoin de polling.
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authClient } from "~/lib/auth-client";
import { Breadcrumb } from "~/components/Breadcrumb";
import { ThreadSkeleton } from "~/components/Skeletons";
import { cn, formatPrice } from "~/lib/utils";

export const Route = createFileRoute("/dashboard/messages/$id")({
  component: MessageThreadPage,
});

function MessageThreadPage() {
  const { id } = Route.useParams();
  const conversationId = id as Id<"conversations">;
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();

  const thread = useQuery(
    api.messages.getThread,
    session ? { conversationId } : "skip"
  );
  const sendMessage = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Redirection si non connecté
  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: "/auth/login" });
    }
  }, [isPending, session, navigate]);

  // Auto-mark-read au mount + à chaque mise à jour du thread (nouveau msg reçu).
  // On déclenche uniquement si le thread est chargé et le user est participant.
  useEffect(() => {
    if (thread) {
      markRead({ conversationId }).catch(() => {});
    }
  }, [thread?.messages.length, conversationId, markRead, thread]);

  // Auto-scroll en bas quand un nouveau message arrive.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  // Skeleton thread pendant la résolution session : header annonce shimmer
  // + 5 bulles alternées gauche/droite — mime la structure du chat à venir.
  if (isPending) return <ThreadSkeleton />;
  if (!session) return null;

  // thread === null → l'utilisateur n'est pas participant (sécurité côté backend)
  if (thread === null) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Conversation introuvable</h1>
        <p className="mt-2 text-brand-700/70">
          Cette conversation n'existe pas ou tu n'en es pas participant.
        </p>
        <Link
          to="/dashboard/messages"
          className="mt-6 inline-block rounded-full bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
        >
          Retour aux messages
        </Link>
      </div>
    );
  }
  // Thread Convex en cours de fetch — même skeleton que pour isPending.
  if (thread === undefined) return <ThreadSkeleton />;

  const { property, messages, role, currentUserId } = thread;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendMessage({ conversationId, body });
      setInput("");
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible d'envoyer le message");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Mon espace", to: "/dashboard" },
          { label: "Messages", to: "/dashboard/messages" },
          {
            label: property?.title ?? "Conversation",
            title: property?.title,
          },
        ]}
      />
      <div className="mx-auto flex h-[calc(100vh-64px)] max-w-3xl flex-col px-6 py-4">
      {/* En-tête */}
      <Link
        to="/dashboard/messages"
        className="inline-flex items-center gap-1 text-sm text-brand-700/70 hover:text-accent-500"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux messages
      </Link>

      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft">
        {property?.images?.[0] && (
          <img
            src={property.images[0]}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {property?.title ?? "Annonce supprimée"}
          </p>
          {property && (
            <p className="text-xs text-brand-700/70">
              {formatPrice(property.price)}
              {property.listingType === "rent" && " /mois"} · {property.city}
            </p>
          )}
        </div>
        {property && (
          <Link
            to="/properties/$id"
            params={{ id: property._id }}
            className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200/70"
          >
            Voir l'annonce
          </Link>
        )}
      </div>

      <p className="mt-2 text-xs text-brand-700/60">
        Tu es {role === "owner" ? "propriétaire" : "acheteur intéressé"}.
      </p>

      {/* Liste des messages */}
      <div className="mt-4 flex-1 overflow-y-auto rounded-2xl bg-brand-50/40 p-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-brand-700/60">
            Aucun message dans cette conversation.
          </p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => {
              const mine = m.fromUserId === currentUserId;
              return (
                <li
                  key={m._id}
                  className={cn(
                    "flex",
                    mine ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      mine
                        ? "rounded-br-md bg-accent-500 text-white"
                        : "rounded-bl-md bg-white text-brand-900"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        mine ? "text-white/70" : "text-brand-700/50"
                      )}
                    >
                      {formatTime(m._creationTime)}
                      {mine && m.readAt !== undefined && " · Lu"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="mt-3 flex items-end gap-2 rounded-2xl bg-white p-2 shadow-soft"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écrire un message…"
          rows={1}
          required
          // Submit sur Enter (sans Shift) — comportement chat standard
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend(e as any);
            }
          }}
          className="flex-1 resize-none rounded-xl bg-brand-50 px-3 py-2 text-sm outline-none placeholder:text-brand-700/50 focus:ring-2 focus:ring-brand-500"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={sending || input.trim().length === 0}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-50"
          aria-label="Envoyer"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      </div>
    </>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}
