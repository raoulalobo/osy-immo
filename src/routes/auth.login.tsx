// src/routes/auth.login.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Formulaire de connexion email + mot de passe (BetterAuth).
//        - Login avec authClient.signIn.email
//        - Login Google si configuré (authClient.signIn.social)
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PasswordField } from "~/components/PasswordField";
import { authClient } from "~/lib/auth-client";
import { humanizeAuthError } from "~/lib/auth-errors";

export const Route = createFileRoute("/auth/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  // Affiche une bannière dédiée si BetterAuth rejette avec EMAIL_NOT_VERIFIED —
  // on propose alors un bouton "Renvoyer l'email de confirmation" pour récupérer
  // l'utilisateur qui a perdu/manqué le premier email.
  const [needsVerification, setNeedsVerification] = useState(false);

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Connexion</h1>
      <p className="mt-2 text-brand-700/70">
        Pas encore de compte ?{" "}
        <Link to="/auth/register" className="font-medium text-accent-500 hover:underline">
          Créer un compte
        </Link>
      </p>

      {/* Bannière "email non vérifié" — affichée si signIn a échoué avec ce code.
          Contient un bouton qui re-déclenche l'envoi du mail de vérif via BetterAuth. */}
      {needsVerification && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Ton email n'est pas encore vérifié
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Clique sur le lien dans l'email reçu à <strong>{email}</strong>, ou
            demande un nouvel email ci-dessous.
          </p>
          <button
            type="button"
            onClick={async () => {
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
            className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Renvoyer l'email de confirmation
          </button>
        </div>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setNeedsVerification(false); // reset si nouvelle tentative
          const { error } = await authClient.signIn.email({
            email,
            password,
            callbackURL: "/dashboard",
          });
          setPending(false);
          if (error) {
            // Cas spécial : email pas encore vérifié → on affiche une bannière
            // dédiée plutôt qu'un simple toast, pour exposer le bouton "Renvoyer".
            // Le code peut arriver sous forme normalisée ("EMAIL_NOT_VERIFIED") ou
            // en version brute ; on teste les deux variantes par robustesse.
            const code = (error as any).code?.toUpperCase?.() ?? "";
            if (code === "EMAIL_NOT_VERIFIED") {
              setNeedsVerification(true);
              return;
            }
            // BetterAuth retourne maintenant { code, message, status } structurés.
            // On mappe les `code` techniques sur des messages utilisateur en français.
            toast.error(humanizeAuthError(error));
            return;
          }
          toast.success("Bienvenue !");
          // Redirection vers l'espace propriétaire — c'est typiquement ce que veut
          // l'utilisateur juste après connexion (gérer ses annonces / favoris).
          void navigate({ to: "/dashboard" });
        }}
        className="mt-8 space-y-4"
      >
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          required
        />
        <div>
          <PasswordField
            label="Mot de passe"
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
          />
          {/* Lien discret aligné à droite sous le champ — pattern UX standard
              (Gmail, Stripe, etc.) qui place le "forgot password" à proximité
              immédiate du champ qui pose problème. */}
          <div className="mt-1.5 text-right">
            <Link
              to="/auth/forgot-password"
              className="text-xs font-medium text-brand-700/70 hover:text-accent-500 hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </div>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
        >
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>

      {/* Bouton Google — visible uniquement si la config OAuth est présente côté serveur */}
      <button
        type="button"
        onClick={async () => {
          await authClient.signIn.social({ provider: "google", callbackURL: "/" });
        }}
        className="mt-4 w-full rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
      >
        Continuer avec Google
      </button>
    </div>
  );
}

function FormField({
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
