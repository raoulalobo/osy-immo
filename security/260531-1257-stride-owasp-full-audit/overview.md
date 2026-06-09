# Security Audit — STRIDE + OWASP full audit

**Date** : 2026-05-31 12:57
**Scope** : codebase complet (`convex/` + `src/`)
**Focus** : full (pas de focus restrictif)
**Iterations** : 15 (standard depth)
**Duration** : ~30 minutes

## Summary

- **Total Findings** : **10 actionables** + 1 baseline transitive
  - Critical : **0**
  - High : **3** (debug actions + IDOR properties.get + énumération listByOwner — regroupés en 2 finding cards)
  - Medium : **4** (inquiries spam, events inflation, description no-limit, headers)
  - Low : **2** (ws CVE, messages spam)
- **STRIDE Coverage** : 6/6 catégories testées
- **OWASP Coverage** : 7/10 catégories testées en profondeur, 10/10 effleurées
- **Confirmed** : 9 | Likely : 0 | Possible : 1 (CVE ws — impact réel limité)

## Top 3 Critical Findings

1. [**4 actions `social.debug*` publiques sans auth**](./findings.md#high-finding-1) — un visiteur anonyme peut lister les comptes sociaux connectés (handles, tokens TTL), inspecter tous les posts Zernio, et **modifier** les rows `socialPosts` de n'importe quelle propriété via la mutation `debugSeedZernioIdAndReconcile`.

2. [**`properties.get` retourne tout doc même draft/sold + `listByOwner` accepte ownerId arbitraire**](./findings.md#high-finding-2) — énumération de toutes les annonces non-publiques d'un user avec leur PII (adresse exacte, lat/lng) à partir d'un simple `ownerId` (qui fuit dans `properties.list`).

3. [**`inquiries.send` sans rate limit + fromEmail unverified**](./findings.md#medium-finding-4) — visiteur anonyme peut flooder la DB à 60 req/s + impersonifier n'importe qui via fromEmail/fromName.

## Architecture observée

- **Stack** : TanStack Start (Vite + React 19) + Convex + Better Auth + Vercel
- **Auth** : Better Auth gère sessions/OAuth Google/email-pwd. Vérification email obligatoire. Reset password sécurisé via Resend.
- **External APIs** : Zernio (publication FB/IG/TikTok), Resend (emails transactionnels), Google OAuth.
- **Storage** : Convex Storage (uploads images/vidéos), URLs CDN publiques par design.
- **Owner checks** : présents et corrects sur les mutations CRUD properties + messaging.

## Points forts du codebase

- ✅ React + esc() emails → aucun XSS exploitable.
- ✅ Mutations `properties.update`/`remove` valident `ownerId === userId`.
- ✅ Mutations `messages.*` valident `participant` (buyer OU owner).
- ✅ `social.retryFailedPlatforms` + `republishToSocials` ont reçu un guard owner récent.
- ✅ Secrets en env vars Convex (jamais en code).
- ✅ Better Auth `requireEmailVerification: true` + `minPasswordLength: 8`.
- ✅ Pas d'usage `dangerouslySetInnerHTML`, pas de SQL raw, pas de `eval`.

## Points faibles

- ❌ 4 actions `debug*` exposées en prod (high impact).
- ❌ `properties.get` + `listByOwner` lisent données privées sans owner check.
- ❌ Mutations publiques sans rate limit (`inquiries.send`, `events.record`).
- ❌ Pas de validation de longueur côté serveur sur les champs texte libres.
- ❌ Headers HTTP de sécurité incomplets (seul HSTS auto par Vercel).

## Files in This Report

- [Threat Model](./threat-model.md) — STRIDE analysis, assets, trust boundaries, adversary personas
- [Attack Surface Map](./attack-surface-map.md) — entry points HTTP, Convex functions, abuse paths
- [Findings](./findings.md) — 10 findings ranked par sévérité avec proof + mitigation
- [OWASP Coverage](./owasp-coverage.md) — couverture A01-A10 + STRIDE 6/6
- [Dependency Audit](./dependency-audit.md) — pnpm audit, 1 moderate (ws transitive)
- [Recommendations](./recommendations.md) — actions priorisées par effort × impact
- [Iteration Log](./security-audit-results.tsv) — raw data des 15 itérations

## Auto-fix sélectionné par l'utilisateur

L'utilisateur a demandé **Rapport + auto-fix Critical/High**. Cibles auto-fix :

| Finding | Auto-fix possible ? |
|---|---|
| Finding 1 (debug actions) | ✅ OUI — `action` → `internalAction` |
| Finding 2 (properties.get + listByOwner) | ✅ OUI — guards owner |
| Finding 4 (inquiries spam) | ✅ OUI — anti-spam cooldown + validation longueurs |
| Finding 6 (description no-limit) | ✅ OUI — validation côté mutation |
| Finding 8 (security headers) | ✅ OUI partiel — headers basiques sans CSP |

Les Medium 5, 7, 9, 10 restent en backlog (refUserId validation, regex email, ws CVE, messages cooldown) → trop spécifiques ou attendent décision business.
