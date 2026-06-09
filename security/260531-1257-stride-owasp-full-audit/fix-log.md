# Fix Log — Auto-remediation (260531)

Fixes appliqués automatiquement après l'audit, sur les findings **Confirmed High** et **Medium auto-fixables** que l'utilisateur a explicitement consenti à corriger via `/security`.

## Fixes appliqués

### ✅ Fix 1 — Finding 1 : `social.debug*` actions → `internalAction`

- **Fichier** : `convex/social.ts`
- **Action** : 4 occurrences de `action({` → `internalAction({` sur `debugGetZernioPostSingle`, `debugSeedZernioIdAndReconcile`, `debugInspectZernioPosts`, `debugListConnectedAccounts`
- **Impact** : les 4 actions ne sont plus exposées via l'API JSON-RPC publique. Toujours appelables via `npx convex run --prod social:debugXyz` pour les ops (les `internalAction` acceptent ce mode d'invocation).
- **Tests post-fix** : `npx tsc --noEmit` → aucune nouvelle erreur. Aucun caller frontend vérifié via `grep -r "debugInspectZernio|debugList..." src/`.

### ✅ Fix 2 — Finding 2 : `properties.get` + `listByOwner`

- **Fichier** : `convex/properties.ts`
- **`properties.get`** : ajout d'un filtre — public si `status === "active"`, sinon owner-only (lecture du userId via `auth.getAuthUserId(ctx)`).
- **`properties.listByOwner`** : retiré l'argument `ownerId` (impossible de demander les annonces d'un autre user). Lit strictement le user authentifié.
- **Impact** : ferme l'énumération PII (adresse, lat/lng, ownerId) des annonces non-publiques.
- **Tests post-fix** : `npx tsc --noEmit` → aucune nouvelle erreur. Vérifié que `dashboard.index.tsx:75` appelle `listByOwner({})` sans argument → non-breaking.
- **Comportement attendu** :
  - `/properties/$id` d'une annonce `active` → publique (inchangé)
  - `/properties/$id` d'une annonce `draft` : visiteur anonyme → `null` (notFound). Owner → annonce visible (édition continue de fonctionner via `/dashboard/edit/:id`).

### ✅ Fix 3 — Finding 4 + 7 : `inquiries.send` anti-spam + validation

- **Fichier** : `convex/inquiries.ts`
- **Ajouts** :
  - Constantes `INQUIRY_NAME_MAX=100`, `INQUIRY_EMAIL_MAX=254`, `INQUIRY_PHONE_MAX=30`, `INQUIRY_MESSAGE_MAX=5000`, `INQUIRY_COOLDOWN_MS=5min`
  - Regex email `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - Validation de chaque champ texte (longueur + regex email)
  - Cooldown 5 min par couple (propertyId, fromEmail) via `query("inquiries").withIndex("by_property").filter(...)`
  - Normalisation email en lowercase (cohérent BetterAuth)
- **Impact** :
  - Bloque les emails non-valides (impersonation partiellement mitigée)
  - Bloque le flood DB anonyme (cooldown 5 min)
  - Empêche les payloads textes >5 KB

### ✅ Fix 4 — Finding 6 : Validation longueurs `properties.create`/`update`

- **Fichier** : `convex/properties.ts`
- **Ajouts** :
  - Constantes `TITLE_MAX=200`, `DESCRIPTION_MAX=5000`, `ADDRESS_MAX=500`, `CITY_MAX=100`, `FEATURES_MAX_LEN=20`, `IMAGES_MAX_LEN=10`, `VIDEOS_MAX_LEN=5`, `URL_ITEM_MAX=1000`
  - Fonction helper `validateTextLengths(args)` qui throw si dépassement
  - Appel dans `create` (sur tous les champs) et `update` (sur les champs du patch)
- **Impact** :
  - Empêche les descriptions de plusieurs MB (storage DoS)
  - Cohérent avec le compteur visuel frontend qui informe à partir de 400 chars

### ✅ Fix 5 — Finding 8 : Security headers Vercel

- **Fichier** : `vercel.json`
- **Ajouts** : section `headers` avec :
  - `X-Frame-Options: DENY` (anti-clickjacking)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()`
- **Impact** :
  - Bloque l'iframing d'osy-immo.com (anti-clickjacking)
  - Empêche le MIME sniffing
  - Limite la fuite de Referer en cross-origin
  - Restreint l'accès aux APIs sensibles (caméra, micro, payment) sauf geolocation (légitime pour `/properties` détail)
- **Note CSP** : volontairement omise — demande inventaire complet des origines externes (Convex, Resend, Zernio, Unsplash, Vercel Analytics, Google Fonts...) à faire en seconde passe.

## Findings NON fixés (raison)

| Finding | Sévérité | Raison du non-fix |
|---|---|---|
| #5 events.record inflation | Medium | Server-side sessionHash + rate-limit composant Convex → modif architecture client, hors scope auto-fix. À planifier. |
| #9 ws CVE | Low | Transitive de `convex` — attendre release upstream. Override potentiellement breaking. |
| #10 messages.send rate | Low | Hors scope auto-fix Critical/High demandé par l'utilisateur. |

## Vérification post-fix

```bash
# Type-check : pas de régression
npx tsc --noEmit
# → seules erreurs préexistantes (convex/social.ts:115 — 3 warnings JSON.profiles
#   liés à noUncheckedIndexedAccess ; properties.$id.tsx:897 lat parsing ;
#   vite.config.ts:36 propriété tsr). Aucune introduite par les fixes.
```

## Prochaine étape suggérée

1. `npx convex deploy --yes` (backend Convex prod)
2. `vercel --prod --yes` (frontend + nouveaux headers)
3. Vérifier les headers en prod :
   ```bash
   curl -sI https://osy-immo.com/ | grep -iE "^(x-frame|x-content|referrer|permissions)"
   ```
4. Vérifier que `properties.get` sur un draft retourne `null` à un visiteur anonyme :
   ```bash
   curl -X POST https://moonlit-chipmunk-526.convex.cloud/api/query \
     -H 'Content-Type: application/json' \
     -d '{"path":"properties:get","args":{"id":"DRAFT_ID"}}'
   # → { "status": "success", "value": null }
   ```
5. Tester `properties.listByOwner` avec un ownerId arbitraire : la mutation rejette (argument invalide schema) → ne renvoie plus rien.
