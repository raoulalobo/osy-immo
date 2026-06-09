# Delta Threat Model — 260601 (vs 260531-1257)

## Audit Delta

**Référence** : audit complet `security/260531-1257-stride-owasp-full-audit/` (J-1)
**Aujourd'hui** : `260601-1159-delta-from-260531-quick` — 5 itérations focalisées sur le diff

## Fichiers modifiés depuis l'audit précédent

### Surfaces avec angle sécurité (à auditer)

| Fichier | Changements |
|---|---|
| `convex/properties.ts` | `get` élargi (PUBLICLY_VISIBLE_STATUSES inclut sold/rented/archived) + nouvelle query `listSimilar` |
| `convex/events.ts` | `record` accepte `referrerSource` + `aggregateEvents` priorise `utmSource > referrerSource > "direct"` |
| `convex/schema.ts` | Nouveau champ `events.referrerSource: v.optional(v.string())` |
| `convex/social.ts` | `listSocialPostsForOwner` agrège toutes les rows par propertyId |
| `convex/inquiries.ts` | Auto-fix audit précédent : validation longueurs + cooldown anti-spam |
| `src/lib/referrer.ts` | **Nouveau** — `classifyReferrer()` côté client |
| `src/routes/properties.$id.tsx` | OwnerPanel + StatusBanner + SimilarPropertiesSection + tracking referrer |

### Surfaces UI sans angle sécurité (zappées)

- `src/components/Skeletons.tsx`, `MediaUploader.tsx`, `PropertyForm.tsx`, `dashboard.*.tsx`, `favorites.tsx`, `utils.ts` : changements purement présentation (skeletons, compteur de caractères, image principale, labels). Aucun nouveau guard auth ni nouvelle mutation.

## Vecteurs à tester en 5 itérations

| # | Vector | Surface | Pré-évaluation |
|---|--------|---------|----------------|
| 1 | `referrerSource` accepté sans whitelist | `convex/events.ts:record` | Likely Medium — pollution analytique + potentiel XSS label si rendu non-échappé |
| 2 | `referrerSource` sans cap de longueur | `convex/events.ts:record` + `convex/schema.ts` | Likely Low — DoS storage (1 MB par event possible) |
| 3 | `properties.get` redevenu public pour sold/rented/archived | `convex/properties.ts:160` | Régression Finding #2 vs J-1 — à classer Info (décision UX validée) ou réouvrir |
| 4 | `properties.listSimilar` public sans rate-limit | `convex/properties.ts:listSimilar` | Likely Info — `properties.list` existe déjà, pas d'amplification nouvelle |
| 5 | `listSocialPostsForOwner` agrégation — perf cross-tenant ? | `convex/social.ts:1121-` | Likely Info — fonction owner-scoped, complexité O(N×M) acceptable |

## Adversary Lenses pour ce delta

- **Hacker classique** : peut-il polluer/exfiltrer via les nouvelles surfaces analytics ?
- **Insider toxique** : accès cross-tenant via listSimilar ou listSocialPostsForOwner ?
- **Infra attacker** : nouvelles env vars / secrets ajoutés ? → Non, aucune nouvelle env var ajoutée.
