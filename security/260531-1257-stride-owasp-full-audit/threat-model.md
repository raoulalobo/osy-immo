# Threat Model — Osy-Immo (260531)

## Tech Stack

- **Frontend** : TanStack Start (Vite + React 19) sur Vercel
- **Backend** : Convex (managed serverless functions + DB)
- **Auth** : Better Auth 1.6.11 via `@convex-dev/better-auth`
- **Emails** : Resend API (transactionnel)
- **Social publishing** : Zernio API (FB + IG + TikTok)
- **Domains** : osy-immo.com (Vercel) + moonlit-chipmunk-526.convex.cloud (Convex prod)

## Asset Inventory

| Asset | Type | Sensibilité | Localisation |
|---|---|---|---|
| Sessions Better Auth (cookies) | Authentication | Critical | Cookies HttpOnly (géré par BA) |
| `ZERNIO_API_KEY` | Secret externe | Critical | Convex env var |
| `RESEND_API_KEY` | Secret externe | Critical | Convex env var |
| `GOOGLE_CLIENT_SECRET` | OAuth secret | Critical | Convex env var |
| Table `properties` (PII : address, lat, lng, owner) | Data | High | Convex DB |
| Table `inquiries` (PII : fromName, fromEmail, fromPhone) | Data | High | Convex DB |
| Table `messages` (correspondance privée) | Data | High | Convex DB |
| Table `users` (BA internal) | Data | Critical | Convex DB (composant BA) |
| Storage uploads (images/vidéos) | Data | Medium | Convex Storage |
| Table `events` (analytics PII : country/city/device) | Data | Low | Convex DB |
| `socialPosts` historique publications | Data | Low | Convex DB |

## Trust Boundaries

```
[Browser]
   │  HTTPS (cookies BA HttpOnly)
   ▼
[Vercel SSR / Edge] (api/ssr.ts + api/auth catch-all)
   │  Server-to-server (token BA propagé via convexBetterAuthReactStart)
   ▼
[Convex Backend] (queries/mutations/actions)
   ├──► Convex Storage (uploads)
   ├──► Zernio API (HTTPS)         ← external, sortant
   ├──► Resend API (HTTPS)         ← external, sortant
   └──► Google OAuth (HTTPS)       ← external, callback entrant via BA
```

Boundaries critiques :
- **Public → Authenticated** : transition vérifiée via `auth.getAuthUserId(ctx)` dans chaque mutation
- **User → Owner d'annonce** : transition vérifiée explicitement (ex. `properties.update` ligne 250, `inquiries.markRead` ligne 86)
- **Anyone → Storage upload** : exige auth via `files.generateUploadUrl` ligne 27
- **Server → External APIs** : URLs hardcodées (pas de SSRF possible côté Zernio/Resend), pas de validation sur réponses

## STRIDE Analysis

| Threat | Asset / Boundary | Concrete vector to test | Pré-évaluation |
|---|---|---|---|
| **S**poofing | Sessions BA | Cookie hijack, CSRF, JWT none-algo (BA gère) | Bas — BA gère |
| **S**poofing | OAuth callback | State CSRF (BA), open redirect via redirectTo | À tester |
| **T**ampering | properties.update | Owner bypass via patch.ownerId ? | À tester (high prio) |
| **T**ampering | favorites.toggle | Race condition double-clic ? | À tester |
| **T**ampering | events.record | Inflation des stats (anonyme + pas de rate-limit) | À tester (high prio) |
| **R**epudiation | inquiries.send | Pas de log d'audit, fromEmail non vérifié | Medium |
| **R**epudiation | properties.update | Pas d'historique des modifs | Low |
| **I**nformation Disclosure | properties.get (public) | Retourne TOUT le doc même status≠active (PII coords, owner) | À tester (high prio) |
| **I**nformation Disclosure | files.getUrl | Public sans auth — n'importe qui peut deviner ? | À tester |
| **I**nformation Disclosure | listForOwner queries | Cross-tenant data leak ? | À tester |
| **I**nformation Disclosure | error messages | Trace stack ou détails Zernio leakés ? | À tester |
| **D**enial of Service | inquiries.send (anonyme) | Spam massif possible — pas de rate limit | À tester (high prio) |
| **D**enial of Service | events.record (anonyme) | Inflation analytics, write amplification | À tester |
| **D**enial of Service | description sans limit | Stockage de descriptions de 10 MB possibles | À tester |
| **D**enial of Service | messages.send | MAX_MESSAGE_LENGTH=2000 → OK, mais nombre illimité | Low |
| **E**levation of Privilege | properties.update.patch | Patch contient status admin-only ? | À tester |
| **E**levation of Privilege | retryFailedPlatforms | Owner check ajouté récemment, à valider | À tester |
| **E**levation of Privilege | dashboard.stats.$id | Cross-owner stats access ? | À tester |
| **E**levation of Privilege | messages.getThread | Participant check OK ? | À tester (déjà vu OK) |

## Attack Surface Summary

- **Entry HTTP** : Vercel SSR + 1 catch-all `/api/auth/*` (BA managed)
- **Convex public functions** : ~30 queries/mutations/actions exposées
- **External callbacks** : 0 webhook entrant (pas de webhook Zernio configuré côté code)
- **File uploads** : 1 endpoint (`generateUploadUrl`) auth-gated, mais pas de validation type/taille

## Adversary Personas (red-team lenses)

| Persona | Mindset | Priority targets |
|---|---|---|
| **Hacker classique** | "Je veux RCE ou data breach" | properties.get info leak, IDOR, XSS dans description |
| **Insider toxique** | "Je suis user, je veux nuire" | DoS inquiries.send, inflation events, spam messages |
| **Supply chain** | "Je compromets une dep" | npm audit (1 finding ws) + lockfile integrity |
| **Infra attacker** | "J'attaque le déploiement" | Secrets dans logs, env vars exposées, CORS, headers |
