# Recommendations — Audit Delta 260601

Aucun finding Critical/High → **aucun fix automatique appliqué** (cohérent avec votre choix). Mais 2 findings Medium/Low restent ouverts, listés ici par effort × impact.

## Priority 1 — Medium (fix sprint)

### 1. Whitelister `referrerSource` + `utmSource` dans `events.record` ⏱️ 5 min

**Finding** : [Finding 1](./findings.md#medium-finding-1)
**Impact** : ferme la pollution analytique + le storage DoS via long strings

```ts
// convex/events.ts — ajout au début du handler

const VALID_REFERRER_BUCKETS = new Set([
  "direct", "internal", "google", "bing", "duckduckgo",
  "qwant", "yahoo", "ecosia", "brave", "external",
]);
const VALID_UTM_BUCKETS = new Set([
  "whatsapp", "copy", "native", "facebook",
]);

handler: async (ctx, args) => {
  // Whitelist : drop silencieusement les valeurs hors liste pour éviter
  // de planter l'event tracking côté client.
  const referrerSource =
    args.referrerSource && VALID_REFERRER_BUCKETS.has(args.referrerSource)
      ? args.referrerSource
      : undefined;
  const utmSource =
    args.utmSource && VALID_UTM_BUCKETS.has(args.utmSource)
      ? args.utmSource
      : undefined;
  // ... reste inchangé, mais utiliser les versions whitelistées
  return await ctx.db.insert("events", { ...args, referrerSource, utmSource });
}
```

Si vous ajoutez plus tard de nouveaux canaux (LinkedIn, Twitter), penser à les ajouter à `VALID_UTM_BUCKETS`.

## Priority 2 — Low (backlog)

### 2. Borner le paramètre `limit` sur les 3 queries publiques ⏱️ 10 min

**Finding** : [Finding 2](./findings.md#low-finding-2)
**Impact** : empêche un attaquant de demander 100k résultats par requête

Une seule constante exportée + `Math.min` sur chaque caller :

```ts
// convex/properties.ts en tête de fichier
const MAX_LIST_LIMIT = 100;

// 3 endroits à modifier :
//   ligne 111 (list)     : filtered.slice(0, Math.min(args.limit ?? 50, MAX_LIST_LIMIT))
//   ligne 143 (search)   : .take(Math.min(args.limit ?? 30, MAX_LIST_LIMIT))
//   ligne 230 (listSimilar) : .take(Math.min(limit, MAX_LIST_LIMIT / 2) * 2)
```

### 3. Cap longueur sur `referrerSource` et `utmSource`

Couvert par la whitelist du fix #1 (les valeurs whitelistées font ≤ 11 chars). Si la whitelist n'est pas implémentée, ajouter `if (args.referrerSource && args.referrerSource.length > 30) throw new Error(...)`.

## Hors scope auto-fix

Les findings ouverts ci-dessus sont **trivials à fixer** (~15 min total). Mais comme vous avez choisi auto-fix Critical/High strict, je ne les applique pas. Demandez-moi explicitement « fix #1 audit delta » si vous voulez que je les applique.

## Comparaison avec audit J-1

L'audit 260531 a fixé **5 findings** (3 High + 2 Medium) via auto-fix. Aucune régression introduite depuis. Les 3 findings ouverts J-1 (events inflation, ws CVE, messages rate limit) sont **inchangés** — non aggravés par les changements du jour.

**Posture globale** : équivalente à J-1, légèrement améliorée (les nouvelles features n'ont pas créé de surface critique). Findings ouverts à clore lors d'un prochain sprint dédié.
