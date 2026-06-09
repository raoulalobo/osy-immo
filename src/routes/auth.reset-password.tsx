// src/routes/auth.reset-password.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Étape 2 du flow "mot de passe oublié".
//        L'utilisateur arrive ici depuis le lien reçu par email (avec ?token=...
//        en query string). Il saisit son nouveau mot de passe, on appelle
//        authClient.resetPassword(token, newPassword), puis on redirige vers
//        /auth/login.
//
// Sécurité :
//   - Le token est un JWT signé par BetterAuth, valable ~1h.
//   - Un seul usage : BetterAuth invalide le token après le premier reset
//     réussi. Un 2e clic sur le même lien échoue avec une erreur claire.
//   - Si le token est absent (URL manuelle, lien tronqué), on affiche un
//     message d'erreur + lien pour relancer le flow forgot-password.
//   - On exige le minimum BetterAuth (8 chars, cf. config minPasswordLength)
//     et on demande deux fois (anti-faute de frappe).
// -------------------------------------------------------------------------------------------------

import {
  createFileRoute,
  Link,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PasswordField } from "~/components/PasswordField";
import { authClient } from "~/lib/auth-client";
import { humanizeAuthError } from "~/lib/auth-errors";

// Schéma des query params attendus.
// `token` est requis (sinon le formulaire est inutile, on affiche une erreur).
// `error` est ajouté par BetterAuth si le token est invalide/expiré au moment
// du clic sur le lien email (avant même d'arriver au formulaire).
interface ResetPasswordSearch {
  token?: string;
  error?: string;
}

export const Route = createFileRoute("/auth/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token, error: searchError } = useSearch({
    from: "/auth/reset-password",
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  // Cas 1 : pas de token dans l'URL (lien tronqué, accès direct, etc.)
  //         OU BetterAuth a déjà signalé une erreur de token (?error=...).
  if (!token || searchError) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Lien invalide ou expiré</h1>
        <p className="mt-3 text-brand-700/80 leading-relaxed">
          Ce lien de réinitialisation n'est plus valable. Les liens expirent au
          bout d'une heure et ne peuvent être utilisés qu'une seule fois.
        </p>
        <p className="mt-3 text-sm text-brand-700/70">
          Demande un nouveau lien si tu as toujours besoin de réinitialiser ton mot de passe.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            to="/auth/forgot-password"
            className="rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
          >
            Demander un nouveau lien
          </Link>
          <Link
            to="/auth/login"
            className="rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  // Cas 2 : token présent → on affiche le formulaire de saisie du nouveau mot de passe.
  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Nouveau mot de passe</h1>
      <p className="mt-2 text-brand-700/70">
        Choisis un mot de passe d'au moins 8 caractères.
      </p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          // Vérification côté client : les 2 champs doivent matcher avant
          // d'envoyer la requête. Évite un aller-retour serveur inutile.
          if (password !== confirm) {
            toast.error("Les deux mots de passe ne correspondent pas.");
            return;
          }
          if (password.length < 8) {
            toast.error("Le mot de passe doit faire au moins 8 caractères.");
            return;
          }
          setPending(true);
          const { error } = await authClient.resetPassword({
            newPassword: password,
            token,
          });
          setPending(false);
          if (error) {
            // Erreurs typiques : token expiré (>1h), token déjà utilisé, mot de
            // passe ne respecte pas la policy BetterAuth.
            toast.error(humanizeAuthError(error));
            return;
          }
          toast.success("Mot de passe mis à jour. Tu peux te connecter.");
          // Redirection vers la page de login — l'utilisateur n'est PAS auto-signé
          // après un reset (par sécurité, BetterAuth force une nouvelle connexion).
          void navigate({ to: "/auth/login" });
        }}
        className="mt-8 space-y-4"
      >
        <PasswordField
          label="Nouveau mot de passe"
          value={password}
          onChange={setPassword}
          required
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirmer le mot de passe"
          value={confirm}
          onChange={setConfirm}
          required
          autoComplete="new-password"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
        >
          {pending ? "Mise à jour…" : "Mettre à jour le mot de passe"}
        </button>
      </form>
    </div>
  );
}
