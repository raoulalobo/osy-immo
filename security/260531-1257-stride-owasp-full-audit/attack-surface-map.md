# Attack Surface Map — Osy-Immo (260531)

## Entry Points HTTP (Vercel + Convex)

### Frontend SSR (Vercel)
```
GET  /                              → index.tsx (public)
GET  /properties                    → properties.index.tsx (public listing)
GET  /properties/:id                → properties.$id.tsx (public détail + tracking event view)
GET  /favorites                     → favorites.tsx (auth gated)
GET  /dashboard                     → dashboard.index.tsx (auth gated)
GET  /dashboard/new                 → dashboard.new.tsx (auth gated)
GET  /dashboard/edit/:id            → dashboard.edit.$id.tsx (auth + owner gated)
GET  /dashboard/stats/:id           → dashboard.stats.$id.tsx (auth + owner gated via query)
GET  /dashboard/messages            → dashboard.messages.index.tsx (auth)
GET  /dashboard/messages/:id        → dashboard.messages.$id.tsx (auth + participant)
GET  /blog                          → blog.index.tsx (public)
GET  /blog/:slug                    → blog.$slug.tsx (public)
GET  /auth/login                    → auth.login.tsx (public)
GET  /auth/register                 → auth.register.tsx (public)
GET  /auth/forgot-password          → auth.forgot-password.tsx (public)
GET  /auth/reset-password           → auth.reset-password.tsx (public)
GET  /auth/email-verified           → auth.email-verified.tsx (public)
*    /api/auth/*                    → handler BetterAuth (signin, signup, callback OAuth, etc.)
```

### Vercel rewrites (`vercel.json`)
```
/img/unsplash/:path*    → images.unsplash.com/:path*          ← proxy externe sans validation
/img/convex/:path*      → moonlit-chipmunk-526.convex.cloud/api/storage/:path*  ← proxy externe
/(.*)                   → /api/ssr                            ← catch-all SSR
```

⚠️ `/img/unsplash/:path*` proxifie n'importe quel `:path` vers unsplash → permet d'utiliser osy-immo.com comme cover open-relay vers unsplash. Faible severity (uniquement unsplash, pas SSRF), mais à noter.

### Convex Functions (public, exposées via API JSON-RPC)

| Function | Type | Auth | Owner check | Notes |
|---|---|---|---|---|
| `auth.getCurrentUser` | query | optional | n/a | OK, safe |
| `auth.checkEmailExists` | query | none | n/a | Pre-check signup (cf. commentaire), volontaire |
| `properties.list` | query | none | n/a | Filtre status="active", OK |
| `properties.search` | query | none | n/a | Search index status=active, OK |
| `properties.get` | query | none | **NON** | ⚠️ Retourne tout doc même draft / sold |
| `properties.listByOwner` | query | optional | implicit | Filtre by ownerId, OK |
| `properties.create` | mutation | required | n/a | userId set as ownerId, OK |
| `properties.update` | mutation | required | ✓ | ownerId === userId check |
| `properties.remove` | mutation | required | ✓ | ownerId === userId check |
| `favorites.toggle` | mutation | required | n/a | userId-scoped |
| `favorites.listMine` | query | optional | implicit | userId-scoped |
| `favorites.isFavorite` | query | optional | implicit | userId-scoped |
| `inquiries.send` | mutation | optional | n/a | ⚠️ Anonyme + pas de rate limit |
| `inquiries.listForOwner` | query | required | implicit | OK |
| `inquiries.markRead` | mutation | required | ✓ | OK |
| `events.record` | mutation | optional | n/a | ⚠️ Anonyme + pas de rate limit |
| `events.statsForProperty` | query | required | ✓ | OK (ligne 177) |
| `events.statsForOwner` | query | required | implicit | OK |
| `events.statsForReferrer` | query | required | implicit | OK |
| `messages.startConversation` | mutation | required | self-contact blocked | OK |
| `messages.send` | mutation | required | participant check | OK |
| `messages.markRead` | mutation | required | participant check | OK |
| `messages.listMine` | query | required | implicit | OK |
| `messages.getThread` | query | required | participant check | OK |
| `messages.totalUnread` | query | required | implicit | OK |
| `files.generateUploadUrl` | mutation | required | n/a | OK |
| `files.getUrl` | query | none | none | ⚠️ N'importe qui peut résoudre n'importe quel storageId |
| `social.retryFailedPlatforms` | action | required | ✓ | OK (corrigé récemment) |
| `social.republishToSocials` | action | required | ✓ | OK |
| `social.listSocialPostsForOwner` | query | required | implicit | OK |
| `social.debugInspectZernioPosts` | action | **none** | none | ⚠️ Debug action publique, expose tokens via Zernio responses |
| `social.debugListConnectedAccounts` | action | **none** | none | ⚠️ Debug action publique, expose accounts Zernio |
| `social.debugGetZernioPostSingle` | action | **none** | none | ⚠️ Debug action publique |
| `social.debugSeedZernioIdAndReconcile` | action | **none** | none | ⚠️ Debug action publique, MUTATION zernioPostId |

## Data Flows

```
[User saisie formulaire annonce]
   description (no length limit) ──► properties.insert
                                       │
                                       ▼
[draft → active via Publier btn]
   properties.update → scheduler.runAfter ──► social.publishToSocials
                                                │
                                                ▼
                                  Zernio API (POST /v1/posts avec description tronquée 400 chars)

[User upload image]
   files.generateUploadUrl → URL signée Convex ~1h
                          → POST direct du File
                          → storageId
                          → files.getUrl({storageId}) [PUBLIC sans auth]
                          → URL CDN stockée dans properties.images

[Visiteur anonyme contacte propriétaire]
   inquiries.send (no auth) ──► insert inquiries (pas de rate limit)
                                  → listForOwner pour le proprio
```

## Abuse Paths

| # | Path | Sévérité présumée | À valider |
|---|------|------|------|
| 1 | `properties.get` sur `draft`/`sold` → leak PII (address, lat/lng, owner) sans auth | High | Iter 1 |
| 2 | `files.getUrl` brute-force storageId → leak fichiers privés | Medium | Iter 2 |
| 3 | `inquiries.send` spam massif sans rate limit → DoS DB | Medium | Iter 3 |
| 4 | `events.record` inflation → stats faussées + write amplification | Medium | Iter 4 |
| 5 | `social.debug*` actions publiques → exposent accounts/posts Zernio | High | Iter 5 |
| 6 | `description` sans limit serveur → 10 MB blob stocké | Medium | Iter 6 |
| 7 | XSS dans description rendue → exécution dans contexte propriétaire | High | Iter 7 |
| 8 | `properties.update.patch` accepte champs admin? (ownerId, publishedAt) | High | Iter 8 |
| 9 | `inquiries.send` avec `fromEmail` non vérifié → impersonation | Medium | Iter 9 |
| 10 | OAuth callback / open redirect via `redirectTo` paramètre | Medium | Iter 10 |
| 11 | `vercel.json` rewrite `/img/unsplash/*` open-relay (proxy unsplash) | Low | Iter 11 |
| 12 | Security headers manquants (CSP, HSTS, X-Frame, etc.) | Low | Iter 12 |
| 13 | Verbose errors leakent stack/internals | Low | Iter 13 |
| 14 | Dependency vulnerabilities (ws CVE-2026-45736) | Low | Iter 14 (baseline) |
| 15 | `properties.update` n'invalide pas `publishedAt` lors de modification post-publication | Info | Iter 15 |
