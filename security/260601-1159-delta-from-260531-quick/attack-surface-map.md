# Attack Surface Delta — 260601

## Nouvelles surfaces depuis 260531-1257

### Queries / mutations exposées (nouvelles ou modifiées)

| Function | Type | Auth | Owner check | Notes |
|---|---|---|---|---|
| `properties.get` | query | none | conditional | Public si status ∈ {active, sold, rented, archived} ; owner-only sinon (draft) |
| `properties.listSimilar` | **new** query | none | n/a | Retourne le doc complet (incluant ownerId) — déjà accessible via `properties.list` |
| `events.record` | mutation (modifié) | optional | n/a | Nouveau champ `referrerSource` accepté sans whitelist |
| `social.listSocialPostsForOwner` | query (modifié) | required | implicit | Agrège toutes les rows par propertyId — scoping ownerId préservé |

### Composants frontend introduits

| Composant | Risque |
|---|---|
| `OwnerPanel` (properties.$id.tsx:436+) | Affiche stats + bouton modifier — owner check via `session.user.id === property.ownerId` |
| `StatusBanner` (properties.$id.tsx:483+) | Pur affichage — pas de risk |
| `SimilarPropertiesSection` (properties.$id.tsx:537+) | Wrapper autour de `useQuery(listSimilar)` — public déjà OK |
| `MediaUploader.setAsPrimary` | Réordonne tableau images local — soumis via properties.update (owner check) |
| `classifyReferrer` (src/lib/referrer.ts) | Pure fonction côté client, parsing URL sécurisé |

## Data Flows nouveaux

```
[Visiteur arrive sur /properties/:id]
   document.referrer (string brut, contrôlé navigateur)
       │
       ▼  classifyReferrer(referrer, origin) [client]
   referrerSource ∈ ["direct"|"internal"|"google"|...|"external"]
       │
       ▼  events.record({referrerSource, ...}) [Convex mutation]
   ⚠️ Pas de whitelist serveur → attaquant peut envoyer string arbitraire
       │
       ▼  insert events
       │
       ▼  aggregateEvents → bucket = utmSource ?? referrerSource ?? "direct"
       │
       ▼  SourceBadges render {meta.label}
   ✓  React échappe → pas de XSS
```

## Abuse Paths (nouveau pattern)

| # | Path | Sévérité |
|---|------|---|
| A | Attaquant flood `events.record` avec `referrerSource` fictifs → pollue le breakdown sources du dashboard owner | Medium |
| B | Attaquant flood `events.record` avec `referrerSource` géant (1 MB) → storage DoS | Low |
| C | Attaquant envoie `listSimilar({limit: 1000000})` → potentiel DoS query | Low |

## Risques mitigés depuis J-1

- ✅ Debug actions Zernio (internalAction) — confirmé toujours protégé
- ✅ `properties.listByOwner` sans `ownerId` arg — confirmé
- ✅ `inquiries.send` anti-spam — actif depuis J-1
- ✅ Security headers Vercel (X-Frame, X-Content-Type, etc.) — actifs
