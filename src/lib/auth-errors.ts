// src/lib/auth-errors.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Traduire les codes d'erreur BetterAuth en messages utilisateur français.
//
// Pourquoi un module dédié :
//   - BetterAuth renvoie des codes stables (slugs) côté API : `INVALID_EMAIL_OR_PASSWORD`,
//     `USER_ALREADY_EXISTS`, `INVALID_EMAIL`, etc. Ces codes sont parfaits pour de l'i18n
//     mais pas affichables tels quels.
//   - Centraliser la table de correspondance dans un module unique évite la duplication
//     entre `/auth/login`, `/auth/register` et d'éventuels futurs formulaires (reset, OAuth).
//
// Source : code shipped par `better-auth/api/auth-errors.ts`. Liste non exhaustive — on
// ne mappe que ce qui peut réellement apparaître côté UI marketplace.
//
// Exemple :
//   const { error } = await authClient.signIn.email({ ... });
//   if (error) toast.error(humanizeAuthError(error));
// -------------------------------------------------------------------------------------------------

/**
 * Forme minimale d'un objet `error` renvoyé par BetterAuth client (`{ data, error }`).
 * On accepte aussi un `string` (rare, mais BetterAuth peut renvoyer juste un message).
 */
type AuthErrorLike =
  | string
  | {
      code?: string;
      message?: string;
      status?: number;
    };

// Table de correspondance code → message FR. Insensible à la casse côté lookup.
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe incorrect.",
  INVALID_EMAIL: "Cette adresse email n'est pas valide.",
  INVALID_PASSWORD: "Mot de passe invalide.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit faire au moins 8 caractères.",
  PASSWORD_TOO_LONG: "Le mot de passe est trop long.",
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cet email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cet email.",
  EMAIL_NOT_VERIFIED: "Email non vérifié. Vérifiez votre boîte mail.",
  USER_NOT_FOUND: "Aucun compte n'est associé à cet email.",
  // BetterAuth renvoie le MÊME code INVALID_TOKEN pour un lien de
  // réinitialisation invalide, déjà utilisé OU expiré (>1h) — cf.
  // password.mjs:141/149. On couvre donc les trois cas dans un seul message.
  INVALID_TOKEN: "Ce lien est invalide ou a expiré. Demandez-en un nouveau.",
  SESSION_EXPIRED: "Votre session a expiré. Reconnectez-vous.",
  UNAUTHORIZED: "Action non autorisée.",
  FORBIDDEN: "Accès refusé.",
  RATE_LIMIT_EXCEEDED: "Trop de tentatives. Patientez quelques minutes.",
  // Erreur réseau / serveur côté front
  NETWORK_ERROR: "Erreur réseau. Vérifiez votre connexion.",
};

/**
 * Convertit une erreur BetterAuth en message lisible en français.
 * Tombe sur un message par défaut si le code n'est pas connu (et garde au
 * passage le `message` BetterAuth s'il existe — utile en dev pour debug).
 */
export function humanizeAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return "Une erreur est survenue. Réessayez.";
  if (typeof error === "string") return error;

  const code = error.code?.toUpperCase();
  if (code && code in MESSAGES) {
    return MESSAGES[code]!;
  }

  // Fallbacks intelligents sur le status HTTP si le code est inconnu
  if (error.status === 401) return "Email ou mot de passe incorrect.";
  if (error.status === 403) return "Accès refusé.";
  if (error.status === 429) return "Trop de tentatives. Patientez quelques minutes.";
  if (error.status && error.status >= 500) {
    return "Erreur serveur. Réessayez dans un instant.";
  }

  return error.message ?? "Une erreur est survenue. Réessayez.";
}
