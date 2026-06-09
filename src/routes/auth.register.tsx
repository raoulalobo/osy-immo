// src/routes/auth.register.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Formulaire d'inscription email + mot de passe (BetterAuth).
//        - Champ "Confirmer le mot de passe" pour éviter les fautes de frappe.
//        - Toggles "œil" sur les deux champs mot de passe (via <PasswordField/>).
//        - Validation client : longueur min. 8, et égalité strict mot de passe / confirmation.
//        - À la création, BetterAuth envoie un email de vérification (callback
//          `sendVerificationEmail` dans convex/auth.ts). Le compte n'est utilisable
//          qu'après que l'utilisateur ait cliqué sur le lien reçu par email.
//        - Auto-signin activé APRÈS vérification (autoSignInAfterVerification: true).
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { PasswordField } from "~/components/PasswordField";
import { authClient } from "~/lib/auth-client";
import { humanizeAuthError } from "~/lib/auth-errors";

export const Route = createFileRoute("/auth/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const convex = useConvex();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  // Bascule l'écran après inscription réussie : on n'envoie plus vers /dashboard
  // (le compte n'est pas vérifié) mais on affiche une instruction claire.
  const [registered, setRegistered] = useState(false);
  // Affiche un message dédié quand l'email saisi correspond déjà à un compte.
  // On contourne ainsi l'anti-énumération silencieuse de BetterAuth qui rend
  // l'UX confusante (faux "compte créé" sans email envoyé).
  // Voir `auth.ts:checkEmailExists` pour la query qui détecte ce cas.
  const [emailTaken, setEmailTaken] = useState(false);

  // Indicateur visuel de cohérence des deux mots de passe — on n'affiche
  // l'erreur que si l'utilisateur a commencé à saisir la confirmation.
  const passwordsMatch =
    confirmPassword.length === 0 || password === confirmPassword;

  // Écran "email déjà utilisé" : on contourne le pattern anti-énumération de
  // BetterAuth en faisant un pre-check explicite via convex.query(checkEmailExists).
  // Plutôt que d'afficher un faux "compte créé", on dit clairement à l'utilisateur
  // qu'un compte existe et on lui propose les bonnes actions (login / reset password).
  if (emailTaken) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Un compte existe déjà</h1>
        <p className="mt-3 text-brand-700/80 leading-relaxed">
          L'adresse <strong>{email}</strong> est déjà associée à un compte
          Osy-Immo. Tu peux te connecter directement, ou réinitialiser ton mot
          de passe si tu l'as oublié.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/auth/login"
            className="flex-1 rounded-xl bg-accent-500 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
          >
            Se connecter
          </Link>
          <Link
            to="/auth/forgot-password"
            className="flex-1 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Mot de passe oublié ?
          </Link>
        </div>
        <button
          type="button"
          onClick={() => {
            setEmailTaken(false);
            setEmail("");
          }}
          className="mt-4 text-xs text-brand-700/70 hover:text-accent-500 hover:underline"
        >
          ← Utiliser une autre adresse email
        </button>
      </div>
    );
  }

  // Écran post-inscription : compte créé, en attente de la vérification email.
  // Vu que `requireEmailVerification: true` côté serveur, le user N'EST PAS
  // connecté ici — il doit obligatoirement valider son email avant de pouvoir
  // utiliser /dashboard.
  if (registered) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Compte créé ✨</h1>
        <p className="mt-3 text-brand-700/80 leading-relaxed">
          On vient d'envoyer un email de confirmation à <strong>{email}</strong>.
          Clique sur le lien qu'il contient pour activer ton compte et te connecter.
        </p>
        <p className="mt-3 text-sm text-brand-700/70">
          Le lien est valable <strong>24 heures</strong>. Pense à vérifier ton dossier
          spam si tu ne le vois pas arriver dans les 2-3 minutes.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            to="/auth/login"
            className="rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
          >
            Retour à la connexion
          </Link>
          <button
            type="button"
            onClick={async () => {
              // Renvoyer le mail de vérification — BetterAuth génère un nouveau token.
              const { error } = await authClient.sendVerificationEmail({
                email,
                callbackURL: "/auth/email-verified",
              });
              if (error) {
                toast.error(humanizeAuthError(error));
                return;
              }
              toast.success("Nouvel email envoyé.");
            }}
            className="rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Renvoyer l'email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Créer un compte</h1>
      <p className="mt-2 text-brand-700/70">
        Déjà inscrit ?{" "}
        <Link to="/auth/login" className="font-medium text-accent-500 hover:underline">
          Connexion
        </Link>
      </p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();

          // Validations client AVANT d'appeler BetterAuth (évite un round-trip serveur inutile)
          if (password.length < 8) {
            toast.error("Le mot de passe doit faire au moins 8 caractères.");
            return;
          }
          if (password !== confirmPassword) {
            toast.error("Les mots de passe ne correspondent pas.");
            return;
          }

          setPending(true);

          // Pre-check : l'email existe-t-il déjà ?
          //
          // Pourquoi avant signUp ? Parce que BetterAuth, quand
          // `requireEmailVerification: true`, renvoie SILENCIEUSEMENT un faux
          // succès pour les emails déjà enregistrés (anti-énumération). Sans ce
          // pre-check, l'utilisateur verrait "Compte créé ✨" sans jamais recevoir
          // l'email — confusion totale.
          //
          // Sécurité : Convex applique son rate-limit natif sur cette query,
          // ce qui limite mécaniquement l'énumération automatisée. Pour un
          // marketplace immobilier, l'enjeu d'énumération est faible.
          try {
            const { exists } = await convex.query(api.auth.checkEmailExists, {
              email,
            });
            if (exists) {
              setPending(false);
              setEmailTaken(true);
              return;
            }
          } catch {
            // Le pré-check a échoué (rate-limit natif Convex ~60 req/s, coupure
            // réseau, etc.). On NE poursuit PAS le signup à l'aveugle : si l'email
            // existait déjà, BetterAuth renverrait un FAUX succès silencieux
            // (anti-énumération, cf. auth.ts:checkEmailExists) et on afficherait
            // "Compte créé ✨" alors qu'aucun email ne part — UX trompeuse.
            // On préfère donc demander à l'utilisateur de réessayer : un échec
            // transitoire bloque l'inscription une seconde, mais ne ment jamais.
            setPending(false);
            toast.error(
              "Impossible de vérifier l'adresse email pour le moment. Réessaie dans un instant."
            );
            return;
          }

          // `callbackURL` est la page où BetterAuth redirige le navigateur APRÈS
          // la vérification réussie de l'email (clic sur le lien du mail).
          // Comme `autoSignInAfterVerification: true` côté serveur, l'utilisateur
          // arrivera DÉJÀ CONNECTÉ sur cette page.
          const { error } = await authClient.signUp.email({
            name,
            email,
            password,
            callbackURL: "/auth/email-verified",
          });
          setPending(false);
          if (error) {
            toast.error(humanizeAuthError(error));
            return;
          }
          // Compte créé — affiche l'écran "vérifie ton email" plutôt que de
          // rediriger vers /dashboard (impossible tant que l'email n'est pas validé).
          setRegistered(true);
        }}
        className="mt-8 space-y-4"
      >
        <Field label="Nom" value={name} onChange={setName} required />
        <Field label="Email" type="email" value={email} onChange={setEmail} required />

        <PasswordField
          label="Mot de passe (min. 8 caractères)"
          value={password}
          onChange={setPassword}
          required
          autoComplete="new-password"
        />

        <div>
          <PasswordField
            label="Confirmer le mot de passe"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
            autoComplete="new-password"
          />
          {/* Feedback inline : rouge si différent, vert si identique (et non vide) */}
          {!passwordsMatch && (
            <p className="mt-1 text-xs text-accent-600">
              Les mots de passe ne correspondent pas.
            </p>
          )}
          {confirmPassword.length > 0 && passwordsMatch && (
            <p className="mt-1 text-xs text-emerald-600">
              ✓ Les mots de passe correspondent.
            </p>
          )}
        </div>

        <button
          type="submit"
          // Désactivé tant que la confirmation diverge — évite les soumissions invalides
          disabled={pending || !passwordsMatch || confirmPassword.length === 0}
          className="w-full rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
        >
          {pending ? "Création…" : "Créer mon compte"}
        </button>
      </form>
    </div>
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
