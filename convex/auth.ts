// convex/auth.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Point central de BetterAuth côté Convex.
//        - Instancie `authComponent` (adapter + helpers serveur) via le composant Convex.
//        - Fournit `createAuth(ctx)` qui construit l'objet `better-auth` pour ce ctx.
//        - Expose `getCurrentUser` (query publique) consommée par `useSession` côté client.
//        - Helper utilitaire `getAuthUserId(ctx)` réutilisé par nos mutations métiers.
//
// Interactions :
//  - `convex/http.ts` enregistre les routes HTTP (/.well-known, callbacks OAuth, etc.).
//  - `src/lib/auth-server.ts` proxy les requêtes /api/auth/* vers Convex.
//  - `src/lib/auth-client.ts` (BetterAuth react) consomme ces endpoints.
//
// Exemple :
//   const userId = await getAuthUserId(ctx); // string | null
// -------------------------------------------------------------------------------------------------

import { betterAuth } from "better-auth/minimal";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { v } from "convex/values";
import authConfig from "./auth.config";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import {
  renderEmailVerificationEmail,
  renderResetPasswordEmail,
} from "./emailTemplates";

// -----------------------------------------------------------------------------
// Helper interne : envoi d'email via Resend.
//
// Factorisé entre sendVerificationEmail et sendResetPassword (et ouvert aux
// futurs callbacks BetterAuth qui exigent un envoi synchrone, comme
// sendOnEmailChange, sendDeleteAccountVerification, etc.).
//
// Pourquoi pas convex/emails.ts ? Parce que ces callbacks sont exécutés dans
// le contexte HTTP de BetterAuth et doivent être SYNCHRONES (pas de scheduler).
// On fait donc un fetch direct ici, avec le même fallback no-op qu'ailleurs.
// -----------------------------------------------------------------------------
async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
  context: string; // ex: "sendResetPassword" — pour les logs
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[auth.${opts.context}] RESEND_API_KEY absent — email skippé.`
    );
    return;
  }
  const from = process.env.EMAIL_FROM ?? "Osy-Immo <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(
        `[auth.${opts.context}] Resend ${res.status}: ${err.slice(0, 200)}`
      );
    }
  } catch (err) {
    console.error(`[auth.${opts.context}] fetch Resend a planté:`, err);
  }
}

// URL publique du site (utilisée par BetterAuth pour les cookies + redirects OAuth)
const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

// Client BetterAuth attaché au composant Convex — gère les tables internes
export const authComponent = createClient<DataModel>(components.betterAuth);

/**
 * Construit l'instance BetterAuth pour un ctx Convex donné.
 * Appelée par le runtime BetterAuth (via /api/auth/*) et par notre code interne.
 *
 * Gestion des erreurs :
 *   - `onAPIError.throw: false` (défaut) : laisse BetterAuth émettre directement
 *     une `Response` HTTP avec le bon code (401, 422, etc.) plutôt qu'une
 *     exception qui remonterait en 500.
 *   - `onAPIError.onError(err, ctx)` : log côté serveur pour observabilité.
 *     Les `APIError` portent `status`, `statusCode`, `body.message` et
 *     `body.code` — on les sérialise proprement pour les Logs Convex.
 *   - `errorURL` : page de fallback pour les erreurs OAuth (redirection
 *     bloquée → on renvoie vers /auth/login côté front).
 */
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      // Le user DOIT cliquer sur le lien de vérification reçu par email avant
      // de pouvoir se connecter. Tente de signIn avant vérif → BetterAuth
      // renvoie l'erreur EMAIL_NOT_VERIFIED (mappée en FR dans auth-errors.ts).
      requireEmailVerification: true,
      // autoSignIn s'applique APRÈS la vérif email (via autoSignInAfterVerification
      // ci-dessous). On le laisse à true pour cohérence — il est ignoré quand
      // requireEmailVerification: true.
      autoSignIn: true,
      minPasswordLength: 8,
      // Callback déclenché par BetterAuth quand le client appelle
      // `authClient.requestPasswordReset({ email, redirectTo })`
      // (endpoint POST /request-password-reset ; l'ancien nom forgetPassword /
      // /forget-password a été retiré en better-auth 1.6.x).
      // Reçu : { user, url, token } — `url` est le lien de reset complet.
      sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
        const { subject, html } = renderResetPasswordEmail({
          recipientName: user.name ?? user.email ?? "Utilisateur",
          resetUrl: url,
        });
        await sendTransactionalEmail({
          to: user.email,
          subject,
          html,
          context: "sendResetPassword",
        });
      },
    },
    // Configuration de la vérification d'email à l'inscription.
    //
    //  - sendOnSignUp: true → l'email est envoyé automatiquement après signUp.email().
    //  - sendVerificationEmail : reçoit { user, url, token } et envoie via Resend.
    //  - autoSignInAfterVerification: true → user automatiquement connecté quand
    //    il clique sur le lien (UX fluide : 1 clic email → arrivée connectée
    //    sur /dashboard sans re-saisie de mot de passe).
    //
    //  Note : si on veut un délai d'expiration custom du token (défaut 24h),
    //  ajouter `expiresIn: <secondes>`.
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({
        user,
        url,
      }: {
        user: any;
        url: string;
      }) => {
        const { subject, html } = renderEmailVerificationEmail({
          recipientName: user.name ?? user.email ?? "Utilisateur",
          verificationUrl: url,
        });
        await sendTransactionalEmail({
          to: user.email,
          subject,
          html,
          context: "sendVerificationEmail",
        });
      },
    },
    // PAS d'`additionalFields` ici : le composant @convex-dev/better-auth
    // a un schema Convex FIXE pour sa table user, et ignore silencieusement
    // toute additionalField qu'on déclarerait ici (le patch arrive bien dans
    // l'API Better Auth mais Convex rejette les colonnes non-déclarées).
    //
    // Pour `bio` et `phone`, voir la table `userProfiles` dans convex/schema.ts
    // + les mutations dans convex/users.ts (updateMyProfile, getMyProfile).
    // Account linking — gère le cas où un user déjà inscrit par email/password
    // se connecte ensuite via Google (OU inversement). Sans cette config,
    // Better Auth bloque l'OAuth avec ?error=account_not_linked pour éviter
    // un account takeover.
    //
    // Pourquoi Google est "trusted" : Google vérifie SYSTÉMATIQUEMENT l'email
    // de ses utilisateurs (clé du compte). Si Google atteste que l'email =
    // raoulalobo@gmail.com, on peut faire confiance et lier au compte
    // email/password existant qui porte le même email vérifié.
    //
    // Pourquoi `requireLocalEmailVerified: false` :
    //   On utilise `emailAndPassword.requireEmailVerification: true` côté
    //   inscription email/password, ce qui crée des users avec
    //   `emailVerified: false` tant qu'ils n'ont pas cliqué sur le lien de
    //   vérification reçu par email. Si un user oublie de vérifier puis tente
    //   Google avec le même email, Better Auth voit un user existant non-
    //   vérifié et refuse le linking (`requireLocalEmailVerified` par défaut
    //   à true, cf. better-auth/dist/oauth2/link-account.mjs:21-22) — d'où
    //   l'erreur `account_not_linked` pour les "comptes fantômes" non-vérifiés.
    //
    //   En passant à false : Google atteste l'email côté provider, donc on
    //   peut lier sans exiger que le user existant ait déjà validé. Better
    //   Auth met automatiquement `emailVerified: true` lors du linking
    //   (cf. ligne 48 de link-account.mjs).
    //
    // Sécurité résiduelle : avant le linking, Better Auth vérifie quand même
    // que `userInfo.emailVerified` est `true` côté Google. Un compte Google
    // avec email non vérifié (cas anormal) ne déclencherait pas le auto-link.
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        requireLocalEmailVerified: false,
      },
    },
    socialProviders: process.env.GOOGLE_CLIENT_ID
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : undefined,
    // Hook d'erreur : log structuré, pas de re-throw → BetterAuth renvoie
    // une vraie Response avec le bon status code (401, 422...) au lieu
    // de propager une exception qui finit en 500 côté Vercel.
    onAPIError: {
      throw: false,
      onError: (error: any, requestCtx: any) => {
        // `error.status` est une string ("UNAUTHORIZED", "BAD_REQUEST"...) ;
        // `error.statusCode` est le code HTTP numérique (401, 400...) ;
        // `error.body.code` est un slug stable utilisable côté UI pour i18n.
        const path = requestCtx?.path ?? "?";
        const code = error?.body?.code ?? error?.status ?? "UNKNOWN";
        const status = error?.statusCode ?? 500;
        const message = error?.body?.message ?? error?.message ?? "(no message)";
        // Log compact + searchable depuis le dashboard Convex
        console.warn(
          `[better-auth] ${requestCtx?.request?.method ?? "?"} ${path} → ${status} ${code}: ${message}`
        );
      },
    },
    plugins: [convex({ authConfig })],
  });
};

/**
 * Query exposée : utilisée par <ClientAuthBoundary/> + côté React via authClient.
 * Renvoie le user courant (ou undefined si pas de session).
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.safeGetAuthUser(ctx);
  },
});

/**
 * Pre-check d'existence d'un email AVANT la soumission du formulaire d'inscription.
 *
 * Pourquoi cette query ?
 *   BetterAuth applique un pattern anti-énumération quand requireEmailVerification: true :
 *   un signup avec un email déjà enregistré renvoie un FAUX succès (token=null + user
 *   synthétique) sans envoyer aucun email. C'est techniquement sécurisé mais
 *   crée une UX très confusante : l'utilisateur croit avoir créé un compte, ne reçoit
 *   jamais l'email, et ne comprend pas pourquoi.
 *
 *   Pour un marketplace consumer comme Osy-Immo (enjeu d'énumération faible : on n'est
 *   pas une banque ni un site sensible), on assume le compromis : on expose une query
 *   `checkEmailExists` pour pouvoir afficher un message clair côté UI.
 *
 * Sécurité résiduelle :
 *   - Convex applique son rate-limit natif (~60 req/s par client) qui limite
 *     mécaniquement les tentatives d'énumération automatisée.
 *   - L'email est normalisé en lowercase pour matcher la même logique que BetterAuth
 *     (cf. sign-up.mjs:163 : `email.toLowerCase()`).
 *   - On renvoie un simple booléen, jamais le user complet — pas de fuite d'autres champs.
 */
export const checkEmailExists = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // Le composant BetterAuth expose son adapter de DB via components.betterAuth.adapter.
    // findOne avec where field=email cherche dans la table interne `user` du composant.
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email.toLowerCase() }],
    });
    return { exists: user != null };
  },
});

/**
 * Helper interne : renvoie l'_id du user authentifié, ou null.
 * Utilisé par nos mutations métier (`properties.ts`, `favorites.ts`, ...).
 */
export async function getAuthUserId(
  ctx: GenericCtx<DataModel>
): Promise<string | null> {
  const user = await authComponent.safeGetAuthUser(ctx);
  return user?._id ?? null;
}

/**
 * Objet "auth" partagé utilisé par les autres fichiers convex/* pour appeler les helpers.
 * Permet l'écriture concise : `await auth.getAuthUserId(ctx)`.
 */
export const auth = {
  getAuthUserId,
  getAuthUser: (ctx: GenericCtx<DataModel>) => authComponent.getAuthUser(ctx),
  safeGetAuthUser: (ctx: GenericCtx<DataModel>) =>
    authComponent.safeGetAuthUser(ctx),
};
