// src/components/Navbar.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Barre de navigation principale.
//
//  Responsive :
//   - Tablet+ (≥ md = 768 px) : tous les liens horizontaux + boutons d'auth (comportement
//     historique inchangé).
//   - Mobile (< md) : seul le logo + une icône burger sont affichés. Le tap sur burger
//     ouvre un sheet latéral droite qui contient l'ensemble des liens, le badge unread
//     et les actions de session.
//
//  Interactions :
//   - `useSession` (BetterAuth) lit le cookie via `/api/auth/get-session`.
//   - `Link` (TanStack Router) gère les liens internes avec prefetching `intent`.
//   - Le sheet ferme automatiquement au tap d'un lien (navigation), au tap overlay,
//     à l'Escape, et lock le scroll body pendant qu'il est ouvert.
// -------------------------------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  Heart,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

export function Navbar() {
  const { data, isPending } = authClient.useSession();
  const user = data?.user;
  const unread =
    useQuery(api.messages.totalUnread, user ? {} : "skip") ?? 0;

  // État du sheet mobile (open/closed). Géré localement, pas besoin de Context.
  const [sheetOpen, setSheetOpen] = useState(false);

  // ----- Effets liés au sheet ouvert ------------------------------------
  useEffect(() => {
    if (!sheetOpen) return;
    // 1) Lock du scroll body : empêche la page de scroller derrière le sheet
    //    (cas où l'utilisateur swipe sur l'overlay). On garde la valeur précédente
    //    pour la restaurer proprement au close (ne pas écraser un éventuel `auto`).
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 2) Escape ferme le sheet
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  return (
    <>
      {/* Fond opaque par défaut + backdrop-blur SEULEMENT si le browser supporte
          `backdrop-filter`. Évite un bug Chromium connu (crbug/1228975) sur
          certains GPU Mali Android où `position: sticky` + `backdrop-filter`
          produit des bandes scintillantes lors du scroll. Les browsers modernes
          (desktop, iOS récents, Android récents) basculent en `bg-white/70` +
          `backdrop-blur` et retrouvent l'effet "glass" original. */}
      <header className="sticky top-0 z-30 bg-white/95 border-b border-brand-200/60 supports-[backdrop-filter]:bg-white/70 supports-[backdrop-filter]:backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          {/* Logo — toujours visible. Pictogramme « immeubles » extrait du
              logo officiel (logo/logo.png → public/logo-mark.png, fond
              transparent) ; le wordmark reste en texte HTML pour rester net
              à toutes les tailles. */}
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-brand-700"
          >
            <img
              src="/logo-mark.png"
              alt=""
              aria-hidden
              className="h-7 w-auto"
            />
            <span>Osy-Immo</span>
          </Link>

          {/* === LIENS DESKTOP (cachés sur mobile) === */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink to="/properties">Annonces</NavLink>
            <NavLink to="/blog">Blog</NavLink>
            {user && <NavLink to="/favorites">Favoris</NavLink>}
            {user && (
              <NavLink to="/dashboard/messages">
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Messages
                  {unread > 0 && (
                    <span
                      key={unread}
                      className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white animate-scale-in"
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
              </NavLink>
            )}
            {user && <NavLink to="/dashboard">Mon espace</NavLink>}
          </div>

          {/* === ACTIONS DESKTOP (auth/profil) === */}
          <div className="hidden md:flex items-center gap-2">
            {isPending ? (
              <div className="h-9 w-24 shimmer rounded-md" />
            ) : user ? (
              <>
                {/* Click sur l'avatar/nom = aller à mon profil.
                    "Mon espace" (lien séparé plus haut) reste pour les annonces. */}
                <Link
                  to="/dashboard/profile"
                  className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-200/70"
                  title="Voir et modifier mon profil"
                >
                  {/* Si l'utilisateur a une photo de profil, on l'affiche au
                      lieu de l'icône générique User. Photo carrée arrondie. */}
                  {(user as any).image ? (
                    <img
                      src={(user as any).image}
                      alt=""
                      aria-hidden
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                  {user.name ?? user.email}
                </Link>
                <button
                  type="button"
                  onClick={() => authClient.signOut()}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
                  aria-label="Se déconnecter"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/auth/login"
                  className="rounded-full px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
                >
                  Connexion
                </Link>
                <Link
                  to="/auth/register"
                  className="rounded-full bg-accent-500 px-4 py-1.5 text-sm font-medium text-white shadow-soft hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
                >
                  Créer un compte
                </Link>
              </>
            )}
          </div>

          {/* === BURGER MOBILE (caché sur tablet+) === */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={sheetOpen}
            aria-controls="mobile-menu-sheet"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-700 hover:bg-brand-100 active:scale-[0.92] transition-transform duration-150 [transition-timing-function:var(--ease-swift-out)] md:hidden"
          >
            <Menu className="h-5 w-5" />
            {/* Dot rouge indiquant un message non lu, visible même menu fermé */}
            {user && unread > 0 && (
              <span
                className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent-500 ring-2 ring-white"
                aria-label={`${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`}
              />
            )}
          </button>
        </nav>
      </header>

      {/* === SHEET MOBILE === */}
      {sheetOpen && (
        <MobileMenuSheet
          user={user}
          unread={unread}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

// -------------------------------------------------------------------------------------------------
// MobileMenuSheet : panneau qui glisse depuis la droite, contient tous les liens
// et les actions de session. Ferme au clic overlay, tap lien, ou Escape.
// -------------------------------------------------------------------------------------------------
function MobileMenuSheet({
  user,
  unread,
  onClose,
}: {
  user: { name?: string | null; email?: string | null } | null | undefined;
  unread: number;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop semi-transparent, fade-in */}
      <div
        aria-hidden
        onClick={onClose}
        // Même pattern défensif que la Navbar : fond plus opaque par défaut,
        // backdrop-blur seulement si supporté proprement par le browser.
        className="fixed inset-0 z-40 bg-ink-900/60 animate-fade-in md:hidden supports-[backdrop-filter]:bg-ink-900/40 supports-[backdrop-filter]:backdrop-blur-sm"
      />

      {/* Sheet 280 px depuis la droite, slide-in-right */}
      <aside
        id="mobile-menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Menu principal"
        className="fixed right-0 top-0 z-50 flex h-[100dvh] w-[280px] flex-col bg-white shadow-2xl animate-slide-in-right md:hidden"
      >
        {/* Header du sheet : logo + bouton fermer */}
        <div className="flex items-center justify-between border-b border-brand-200/60 px-5 py-3">
          <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-brand-700">
            <img
              src="/logo-mark.png"
              alt=""
              aria-hidden
              className="h-7 w-auto"
            />
            Osy-Immo
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-700 hover:bg-brand-100 active:scale-[0.92] transition-transform duration-150 [transition-timing-function:var(--ease-swift-out)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Liens — onClose au clic pour fermer le sheet à la navigation */}
        <nav className="flex flex-col gap-1 px-3 py-4">
          <SheetLink to="/properties" onClick={onClose}>
            Annonces
          </SheetLink>
          <SheetLink to="/blog" onClick={onClose}>
            Blog
          </SheetLink>
          {user && (
            <SheetLink to="/favorites" onClick={onClose} icon={<Heart className="h-4 w-4" />}>
              Favoris
            </SheetLink>
          )}
          {user && (
            <SheetLink
              to="/dashboard/messages"
              onClick={onClose}
              icon={<MessageSquare className="h-4 w-4" />}
              badge={
                unread > 0 ? (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null
              }
            >
              Messages
            </SheetLink>
          )}
          {user && (
            <SheetLink to="/dashboard" onClick={onClose} icon={<User className="h-4 w-4" />}>
              Mon espace
            </SheetLink>
          )}
          {user && (
            <SheetLink
              to="/dashboard/profile"
              onClick={onClose}
              icon={<User className="h-4 w-4" />}
            >
              Mon profil
            </SheetLink>
          )}
        </nav>

        {/* Spacer pour pousser les actions en bas */}
        <div className="flex-1" />

        {/* Section auth — séparateur visible */}
        <div className="border-t border-brand-200/60 p-4">
          {user ? (
            <div className="space-y-2">
              <div className="rounded-xl bg-brand-50 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-brand-700/60">
                  Connecté
                </p>
                <p className="truncate font-medium text-brand-700">
                  {user.name ?? user.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  authClient.signOut();
                  onClose();
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 active:scale-[0.98] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
              >
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <Link
                to="/auth/login"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-200 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 active:scale-[0.98] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
              >
                <LogIn className="h-4 w-4" />
                Connexion
              </Link>
              <Link
                to="/auth/register"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
              >
                <UserPlus className="h-4 w-4" />
                Créer un compte
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * Lien dans le sheet mobile — variante visuelle plus large que le NavLink desktop,
 * avec icône optionnelle à gauche et badge à droite (pour les compteurs non-lus).
 */
function SheetLink({
  to,
  onClick,
  icon,
  badge,
  children,
}: {
  to: string;
  onClick?: () => void;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      activeProps={{
        className: cn(
          "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
          "bg-brand-100 text-brand-700"
        ),
      }}
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm text-brand-700 hover:bg-brand-50 transition-colors"
    >
      <span className="inline-flex items-center gap-2.5">
        {icon}
        {children}
      </span>
      {badge}
    </Link>
  );
}

function NavLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="rounded-full px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-100"
      activeProps={{
        className: cn(
          "rounded-full px-3 py-1.5 text-sm",
          "bg-brand-100 text-brand-700 font-medium"
        ),
      }}
    >
      {children}
    </Link>
  );
}
