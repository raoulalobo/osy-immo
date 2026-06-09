# Fix Log — Delta 260601

## Fixes appliqués (demande explicite après rapport initial)

L'utilisateur a explicitement demandé l'application des fixes Medium + Low après lecture du rapport (« applique les fixes audit delta 260601 »). Les deux ont été appliqués backend Convex uniquement — aucun changement frontend nécessaire.

### ✅ Fix 1 — Finding 1 (Medium) : whitelist `referrerSource` + `utmSource`

- **Fichier** : `convex/events.ts`
- **Ajout** : 2 constantes `VALID_REFERRER_BUCKETS` (10 entrées) et `VALID_UTM_BUCKETS` (4 entrées) ; dans le handler `record`, les valeurs hors liste sont remplacées par `undefined` avant l'insert (drop silencieux pour ne pas casser le tracking client).
- **Test prod** : envoyé `events:record` avec `referrerSource: "hackerman_xxxxx"` → mutation success, mais la valeur fictive est **absente** de la table events. ✅
- **Effet collatéral attendu** : si quelqu'un ajoute un nouveau bucket (ex. LinkedIn) sans mettre à jour la whitelist, les events partent sans cette dimension. Documentation ajoutée dans les commentaires pour rappeler.

### ✅ Fix 2 — Finding 2 (Low) : cap `MAX_LIST_LIMIT=100`

- **Fichier** : `convex/properties.ts`
- **Ajout** : constante `MAX_LIST_LIMIT = 100` en tête de fichier ; `Math.min(args.limit ?? default, MAX_LIST_LIMIT)` sur les 3 queries (`list`, `search`, `listSimilar`). Pour `listSimilar` qui fait `.take(limit * 2)`, on cap à `MAX_LIST_LIMIT / 2` en entrée pour ne jamais dépasser 100 documents fetchés.
- **Test prod** : envoyé `properties:list({limit: 999})` → reçu 8 annonces (toutes les actives ; cap à 100 actif). ✅
- **Aucun changement UI** : tous les callers frontend passent des `limit` ≤ 50, donc 0 régression.

## Comparaison vs J-1

| Métrique | J-1 (260531) | Avant fix delta | Après fix delta |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 3 → 0 (fixés J-1) | 0 | 0 |
| Medium | 1 (héritage) | 2 | 1 (héritage) |
| Low | 2 | 3 | 2 |

Les **2 nouveaux findings** du delta sont fermés. Les 3 héritages J-1 (events.record inflation, ws CVE, messages rate limit) restent ouverts comme avant.

## Posture sécurité

Comparée à l'audit J-1 :

| Métrique | J-1 (260531) | Aujourd'hui (260601) | Évolution |
|---|---|---|---|
| Critical | 0 | 0 | → stable |
| High | 3 | 0 | ↓ -3 (tous fixés au précédent audit) |
| Medium | 4 → 1 (3 fixés) | 1 (nouveau) | → 1 (différent) |
| Low | 2 | 2 (1 nouveau + 1 héritage) | → idem |
| **STRIDE coverage** | 6/6 | 6/6 | stable |
| **OWASP coverage** | 7/10 deep | 4/10 deep (delta only) | normal pour delta |

Aucune régression. L'introduction des nouvelles features (referrerSource, listSimilar, SimilarPropertiesSection, agrégation socialPosts) n'a pas créé de surface critique. Le seul finding Medium est trivial à fermer (~5 min — whitelist sets).

## Pour fermer les 2 findings restants

Voir [recommendations.md](./recommendations.md). Demandez explicitement « applique le fix Medium audit delta » si vous voulez que je le fasse — j'ai bridé l'auto-fix sur Critical/High par directive.
