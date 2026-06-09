// src/routes/dashboard.profile.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Page de profil utilisateur `/dashboard/profile`.
//        L'utilisateur connecté édite son pseudo, sa photo, sa bio et son téléphone.
//
//        - Pseudo (name) + photo (image) + bio sont AFFICHÉS publiquement
//          dans la mini-card vendeur sur les pages détail d'annonces.
//        - Téléphone reste PRIVÉ — jamais retourné par users.getPublicProfile.
//          Sera utilisé plus tard si on ajoute un click-to-call sur les
//          annonces du vendeur.
//
// Auth : redirige vers /auth/login si non connecté.
// API : utilise `authClient.updateUser({...})` (Better Auth) — endpoint
//       PATCH /api/auth/update-user accepte les additionalFields déclarés
//       dans convex/auth.ts (phone, bio).
// -------------------------------------------------------------------------------------------------

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Breadcrumb } from "~/components/Breadcrumb";
import { MediaUploader } from "~/components/MediaUploader";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

// Caps validation côté client (UI). Le backend Better Auth ne re-valide pas
// les additionalFields — c'est notre seule barrière, mais OK pour des champs
// non-critiques (pas de PII bancaire, pas d'access control).
const NAME_MIN = 1;
const NAME_MAX = 50;
const BIO_MAX = 300;
const PHONE_MAX = 30;

export const Route = createFileRoute("/dashboard/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();

  // Redirige vers login si la session est résolue ET vide
  useEffect(() => {
    if (!isPending && !session) {
      void navigate({ to: "/auth/login" });
    }
  }, [isPending, session, navigate]);

  if (isPending) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-brand-700/70">
        Chargement de votre profil…
      </div>
    );
  }
  if (!session) return null;

  // Le formulaire est piloté par un sous-composant pour que `session.user`
  // soit garanti défini (TypeScript narrowing après les early returns).
  return (
    <>
      <Breadcrumb
        items={[
          { label: "Accueil", to: "/" },
          { label: "Mon espace", to: "/dashboard" },
          { label: "Mon profil" },
        ]}
      />
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Mon profil</h1>
        <p className="mt-1 text-brand-700/70">
          Renseignez votre pseudo, photo et bio pour rassurer les acheteurs
          qui consultent vos annonces. Téléphone reste privé.
        </p>
        <ProfileForm user={session.user as UserSession} />
      </div>
    </>
  );
}

interface UserSession {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

function ProfileForm({ user }: { user: UserSession }) {
  // Champs custom (bio + phone) chargés depuis notre table userProfiles
  // — pas dans la session Better Auth (qui ne gère que name/email/image).
  const myProfile = useQuery(api.users.getMyProfile, {});
  const updateMyProfile = useMutation(api.users.updateMyProfile);

  // État initial pré-rempli depuis la session + getMyProfile.
  // `image` est un tableau pour matcher la signature MediaUploader (0..N) — cap à 1.
  const [name, setName] = useState<string>(user.name ?? "");
  const [images, setImages] = useState<string[]>(
    user.image ? [user.image] : []
  );
  const [bio, setBio] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [pending, setPending] = useState(false);
  // Une fois `myProfile` chargé, on initialise bio/phone (1 seule fois).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (myProfile !== undefined && !hydrated) {
      setBio(myProfile?.bio ?? "");
      setPhone(myProfile?.phone ?? "");
      setHydrated(true);
    }
  }, [myProfile, hydrated]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Validation client (le serveur revalide aussi)
    const trimmedName = name.trim();
    if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) {
      toast.error(`Le pseudo doit faire ${NAME_MIN} à ${NAME_MAX} caractères.`);
      return;
    }
    if (bio.length > BIO_MAX) {
      toast.error(`La bio dépasse ${BIO_MAX} caractères.`);
      return;
    }
    if (phone.length > PHONE_MAX) {
      toast.error(`Le téléphone dépasse ${PHONE_MAX} caractères.`);
      return;
    }

    setPending(true);
    try {
      // Stratégie hybride :
      //   1. name + image → Better Auth (champs natifs de sa table user)
      //   2. bio + phone  → notre mutation Convex updateMyProfile (table userProfiles)
      //
      // Les 2 calls sont séquentiels — si le 1er échoue on n'écrase pas
      // accidentellement le profil custom avec des données incohérentes.
      await authClient.updateUser({
        name: trimmedName,
        image: images[0] ?? null,
      });
      await updateMyProfile({ bio, phone });
      toast.success("Profil mis à jour");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la sauvegarde");
    } finally {
      setPending(false);
    }
  }

  // Compteur bio — 3 paliers visuels (cohérent avec PropertyForm description)
  const bioOver = bio.length > BIO_MAX;
  const bioNear = !bioOver && bio.length > BIO_MAX * 0.75;

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-soft"
    >
      {/* Pseudo */}
      <Field
        label="Pseudo"
        hint={`Visible publiquement sur vos annonces. ${name.trim().length}/${NAME_MAX} caractères.`}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={NAME_MAX}
          className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </Field>

      {/* Photo de profil — MediaUploader avec cap à 1 image */}
      <Field
        label="Photo de profil"
        hint="Une seule image (JPEG, PNG, WEBP). Pré-rempli automatiquement si vous êtes connecté via Google."
      >
        <MediaUploader
          kind="image"
          value={images}
          onChange={setImages}
          max={1}
          maxSizeMB={5}
          label=" " // espace insécable pour ne pas afficher le label par défaut du composant (le Field parent gère déjà le label)
        />
      </Field>

      {/* Bio */}
      <Field label="Bio (description courte)">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Quelques mots sur vous (ex: « Vendeur particulier — Douala. 5 ans d'expérience immobilier. »)"
          className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <p
          className={cn(
            "mt-1 text-xs",
            bioOver
              ? "font-medium text-red-600"
              : bioNear
                ? "text-amber-600"
                : "text-brand-700/50"
          )}
        >
          {bioOver
            ? `${bio.length} caractères — limite ${BIO_MAX} dépassée`
            : `${bio.length} / ${BIO_MAX} caractères`}
        </p>
      </Field>

      {/* Téléphone — privé */}
      <Field
        label="Téléphone (privé)"
        hint="Reste confidentiel. Ne sera jamais affiché publiquement. Pourra servir pour des notifications SMS futures."
      >
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+237 6 XX XX XX XX"
          maxLength={PHONE_MAX}
          className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </Field>

      {/* Email — affiché en lecture seule (Better Auth gère le changement
          via un flow dédié sendChangeEmail, à activer plus tard si besoin) */}
      <Field label="Email (lecture seule)">
        <input
          type="email"
          value={user.email ?? ""}
          disabled
          className="w-full cursor-not-allowed rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700/60"
        />
      </Field>

      <button
        type="submit"
        disabled={pending || bioOver}
        className="w-full rounded-xl bg-accent-500 px-4 py-3 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
      >
        {pending ? "Sauvegarde…" : "Enregistrer les modifications"}
      </button>
    </form>
  );
}

// Helper UI : un wrapper label + hint cohérent avec le PropertyForm.
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-brand-700/50">{hint}</p>}
    </div>
  );
}
