// src/routes/auth.email-verified.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Landing page affichée après que BetterAuth a validé le token de
//        vérification d'email (passée en `callbackURL` lors du signUp).
//
// Cycle :
//   1. User clique le lien dans l'email "Confirme ton adresse email"
//   2. Browser → /api/auth/verify-email?token=...&callbackURL=/auth/email-verified
//   3. BetterAuth valide le token, marque user.emailVerified = true
//   4. Comme autoSignInAfterVerification: true → BetterAuth crée une session
//   5. Browser redirigé vers /auth/email-verified — utilisateur DÉJÀ CONNECTÉ
//   6. CTA "Aller au dashboard" pour continuer
//
// Cas d'erreur :
//   - Token invalide / expiré : BetterAuth ajoute ?error=... à la redirection.
//     On affiche un message clair + lien pour relancer l'inscription.
// -------------------------------------------------------------------------------------------------

import { createFileRoute, Link, useSearch } from "@tanstack/react-router";

interface EmailVerifiedSearch {
  error?: string;
}

export const Route = createFileRoute("/auth/email-verified")({
  validateSearch: (search: Record<string, unknown>): EmailVerifiedSearch => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: EmailVerifiedPage,
});

function EmailVerifiedPage() {
  const { error } = useSearch({ from: "/auth/email-verified" });

  // Cas d'erreur : token invalide ou expiré. BetterAuth nous redirige ici avec
  // ?error=... (ex: "invalid_token", "expired_token").
  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-6 py-16 text-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent-50 text-accent-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Lien invalide ou expiré
        </h1>
        <p className="mt-3 text-brand-700/80 leading-relaxed">
          Ce lien de vérification n'est plus valable. Les liens expirent après
          24 heures et ne peuvent être utilisés qu'une seule fois.
        </p>
        <p className="mt-3 text-sm text-brand-700/70">
          Connecte-toi pour qu'on te renvoie un nouveau lien.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/auth/login"
            className="rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
          >
            Aller à la connexion
          </Link>
        </div>
      </div>
    );
  }

  // Cas nominal : email vérifié + utilisateur auto-signed-in par BetterAuth.
  // On affiche un message de bienvenue + CTA vers /dashboard.
  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16 text-center">
      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Email confirmé 🎉</h1>
      <p className="mt-3 text-brand-700/80 leading-relaxed">
        Ton compte Osy-Immo est maintenant actif. Bienvenue dans la communauté
        immobilière camerounaise !
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          to="/dashboard"
          className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)]"
        >
          Aller au dashboard
        </Link>
        <Link
          to="/properties"
          className="rounded-xl border border-brand-200 bg-white px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          Parcourir les annonces
        </Link>
      </div>
    </div>
  );
}
