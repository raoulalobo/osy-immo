// src/routes/auth.forgot-password.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Étape 1 du flow "mot de passe oublié".
//        L'utilisateur saisit son email → on appelle BetterAuth qui envoie un
//        email contenant un lien de reset (via le callback `sendResetPassword`
//        défini dans convex/auth.ts).
//
// UX (pattern OWASP — non-énumération des comptes) :
//   - On affiche TOUJOURS un message de succès générique, même si l'email n'existe
//     pas dans la base. Ça empêche un attaquant de découvrir quels emails sont
//     enregistrés sur la plateforme.
//   - BetterAuth gère cette logique côté serveur : le callback sendResetPassword
//     n'est appelé QUE si l'email existe, mais le client reçoit toujours { error: null }.
//
// Étape 2 : /auth/reset-password reçoit le token via query param et applique le
// nouveau mot de passe (cf. fichier `auth.reset-password.tsx`).
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "~/lib/auth-client";
import { humanizeAuthError } from "~/lib/auth-errors";

export const Route = createFileRoute("/auth/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  // Bascule l'affichage en "écran de confirmation" après soumission réussie.
  // On évite de laisser le formulaire vidé visible pour éviter un re-soumission accidentelle.
  const [sent, setSent] = useState(false);

  // Écran de confirmation : on ne reproche jamais "email inexistant" ici (cf. note OWASP en tête).
  if (sent) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Vérifie tes emails</h1>
        <p className="mt-3 text-brand-700/80 leading-relaxed">
          Si un compte Osy-Immo existe avec l'adresse <strong>{email}</strong>, tu vas
          recevoir un email contenant un lien pour choisir un nouveau mot de passe.
        </p>
        <p className="mt-3 text-sm text-brand-700/70">
          Le lien est valable <strong>1 heure</strong>. Pense à vérifier ton dossier spam si tu
          ne le vois pas arriver dans les 2-3 minutes.
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
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Renvoyer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Mot de passe oublié ?</h1>
      <p className="mt-2 text-brand-700/70">
        Saisis ton email — on t'envoie un lien pour choisir un nouveau mot de passe.
      </p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          // `redirectTo` est la page vers laquelle BetterAuth redirige le navigateur
          // APRÈS avoir validé le token et appliqué le nouveau mot de passe.
          // On envoie l'utilisateur sur /auth/reset-password qui présentera le
          // formulaire "nouveau mot de passe" (le token est ajouté en query string
          // par BetterAuth automatiquement).
          //
          // NB : la méthode est `requestPasswordReset` (endpoint POST
          // /request-password-reset). L'ancien nom `forgetPassword` (endpoint
          // /forget-password) a été retiré dans better-auth 1.6.x — l'appeler
          // renvoyait un 404 silencieux car le proxy client mappe le nom de
          // méthode vers un chemin inexistant côté serveur.
          const { error } = await authClient.requestPasswordReset({
            email,
            redirectTo: "/auth/reset-password",
          });
          setPending(false);
          if (error) {
            // En théorie BetterAuth ne renvoie pas d'erreur sur email inexistant
            // (cf. note OWASP). Les seules erreurs ici sont des problèmes infra
            // (rate-limit, validation email côté serveur, ...).
            toast.error(humanizeAuthError(error));
            return;
          }
          // Succès apparent — l'écran de confirmation est volontairement vague
          // ("SI un compte existe...") pour ne pas révéler l'existence d'un compte.
          setSent(true);
        }}
        className="mt-8 space-y-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
            Email
          </label>
          <input
            type="email"
            value={email}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
        >
          {pending ? "Envoi…" : "Envoyer le lien"}
        </button>
      </form>

      <p className="mt-6 text-sm text-brand-700/70">
        Tu te souviens du mot de passe ?{" "}
        <Link to="/auth/login" className="font-medium text-accent-500 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
