# Findings — Audit Delta 260601 (vs 260531-1257)

**Audit incrémental** sur les fichiers modifiés depuis le dernier audit complet (J-1).
2 findings actionables : **0 Critical · 0 High · 1 Medium · 1 Low**.

## Delta Summary (vs `260531-1257-stride-owasp-full-audit/`)

| Statut | Count | Détails |
|---|---|---|
| **New findings** | 2 | referrerSource (M), limit arg sans cap (L) |
| **Fixed depuis J-1** | 5 | debug actions → internalAction, properties.get filter, listByOwner restriction, inquiries anti-spam, security headers (cf. fix-log J-1) |
| **Recurring (unfixed)** | 3 | events.record inflation, ws CVE-2026-45736, messages.send rate limit |
| **Décisions UX validées** | 1 | properties.get public pour sold/rented/archived (rollback partiel intentionnel) |

Aucun **High** ou **Critical** introduit. La posture sécurité reste celle post-audit J-1.

---

## [MEDIUM] Finding 1 : `referrerSource` accepté sans whitelist (pollution stats + storage DoS)

- **OWASP** : A04 (Insecure Design)
- **STRIDE** : T (Tampering) + D (DoS)
- **Location** : `convex/events.ts:52` + `convex/schema.ts events.referrerSource`
- **Confidence** : Confirmed
- **Status** : ✅ **FIXED** (applied 260601, voir [fix-log.md](./fix-log.md#fix-1))

### Description

La mutation `events.record` accepte `referrerSource: v.optional(v.string())` sans validation. Un attaquant qui appelle directement la mutation Convex via le client JSON-RPC peut envoyer n'importe quelle string comme bucket de provenance :

```js
convex.mutation(api.events.record, {
  propertyId: "<any property id>",
  type: "view",
  referrerSource: "hackerman",   // ← bucket fictif accepté
  sessionHash: crypto.randomUUID()
});
```

Conséquences :

1. **Pollution analytique** : un attaquant crée des dizaines de buckets fantaisistes (`"hackerman"`, `"<script>"`, `"sql_inj"`) → faussent le breakdown sources affiché à l'owner dans `/dashboard` (colonne Sources) et `/dashboard/stats/:id` (BreakdownCard Canaux d'arrivée). Décisions marketing biaisées si on les exploite.
2. **Storage DoS** : pas de cap de longueur → un attaquant envoie `referrerSource: "A".repeat(1_000_000)` → events row pèsera ~1 MB. Couplé avec l'absence de rate limit sur `events.record` (Finding #5 J-1), volume potentiel = quelques GB en une heure.

### Hors scope du risque

- **Pas de XSS** : la valeur brute du bucket est affichée dans `SourceBadges` (`dashboard.index.tsx:679-704`) via `{meta.label}` interpolé par React → échappement automatique HTML.

### Code Evidence

```ts
// convex/events.ts:38-57
export const record = mutation({
  args: {
    propertyId: v.id("properties"),
    type: v.union(...),
    refUserId: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    referrerSource: v.optional(v.string()),  // ← aucune contrainte
    ...
  },
  handler: async (ctx, args) => {
    // ... pas de validation referrerSource ...
    return await ctx.db.insert("events", args);
  },
});
```

### Mitigation

Whitelist explicite + cap de longueur dans la mutation. La liste des buckets valides est connue (`src/lib/referrer.ts`) :

```ts
const VALID_REFERRER_BUCKETS = new Set([
  "direct", "internal", "google", "bing", "duckduckgo",
  "qwant", "yahoo", "ecosia", "brave", "external",
]);

// Dans handler avant insert :
if (args.referrerSource !== undefined) {
  if (!VALID_REFERRER_BUCKETS.has(args.referrerSource)) {
    // Si pas whitelisté → on drop silencieusement (pas d'erreur côté client)
    args.referrerSource = undefined;
  }
}
```

Appliquer le même pattern à `utmSource` (déjà signalé comme non-validé dans Finding #5 J-1 mais sans détail). La whitelist utm : `["whatsapp", "copy", "native", "facebook"]`.

### Auto-fix : NON (Medium, hors scope Critical/High choisi)

---

## [LOW] Finding 2 : Paramètre `limit` sans cap maximum (3 queries publiques)

- **OWASP** : A04 (Insecure Design)
- **STRIDE** : D (DoS)
- **Location** : `convex/properties.ts:62,131,204`
- **Confidence** : Confirmed
- **Status** : ✅ **FIXED** (applied 260601, voir [fix-log.md](./fix-log.md#fix-2))

### Description

Trois queries publiques exposent un paramètre `limit: v.optional(v.number())` sans contrainte supérieure :

| Query | Default | Cap max |
|---|---|---|
| `properties.list` (ligne 62) | 50 | ❌ aucun |
| `properties.search` (ligne 131) | 30 | ❌ aucun |
| `properties.listSimilar` (ligne 204) | 4 | ❌ aucun |

Un attaquant peut envoyer `limit: 100000`. Conséquences pratiques :
- `properties.list` : déjà fait `collect()` du sous-ensemble par city/listingType puis tri en mémoire, le `slice(0, limit)` ne réduit pas le coût.
- `properties.search` : `.take(args.limit ?? 30)` → Convex récupère effectivement `limit` documents.
- `properties.listSimilar` : `.take(limit * 2)` → multiplie par 2.

Convex limite probablement le `take()` à ~32k naturellement (à valider), mais 32k docs par requête × 60 req/s = forte charge backend si un attaquant flood.

### Mitigation

Borner explicitement via `Math.min(args.limit ?? default, MAX_LIMIT)` :

```ts
const MAX_LIST_LIMIT = 100;
// ...
return filtered.slice(0, Math.min(args.limit ?? 50, MAX_LIST_LIMIT));
```

Cohérent avec les pratiques REST classiques : pagination via `cursor` + cap `limit` à ~100.

### Auto-fix : NON (Low, hors scope)

---

## [INFO] Décision UX validée : `properties.get` public pour sold/rented/archived

- **Référence** : Finding #2 audit 260531 (initial : owner-only pour tout non-active)
- **Décision** : l'utilisateur a explicitement choisi de réautoriser la lecture publique sur sold/rented/archived (cf. l'AskUserQuestion "lecture publique avec badge statut + actions désactivées").
- **Cas critique préservé** : `draft` reste owner-only — c'était le cœur du Finding #2.
- **Mitigation côté UX** : la page détail affiche un bandeau "Vendue / Louée / Retirée" + désactive Contact/Favori, et le `og:title` préfixe `[VENDU]` / `[LOUÉ]` / `[RETIRÉ]` pour les previews WhatsApp/Facebook.

**Pas un finding ouvert** — décision business documentée.

---

## Findings J-1 toujours ouverts (rappel)

| # J-1 | Sévérité | État | Note |
|---|---|---|---|
| #5 `events.record` inflation | Medium | Open | Demande server-side sessionHash + composant rate-limiter (architecture client) |
| #9 `ws` CVE-2026-45736 | Low | Open | Transitive Convex, attendre upstream |
| #10 `messages.send` rate limit | Low | Open | Backlog |

Le **Finding 1 du présent audit** (referrerSource sans whitelist) **renforce le Finding #5 J-1** : l'attaquant peut maintenant non seulement inflater le compteur de vues mais aussi diversifier artificiellement les buckets sources. Fixer Finding 1 limite les dégâts mais ne ferme pas Finding #5.
