# Findings — Osy-Immo Security Audit (260531)

10 findings actionables : **3 High** · **4 Medium** · **2 Low** · **1 baseline transitive**.

## Statut global après auto-fix

| Severity | Total | ✅ Fixed | ⚠️ Open |
|---|---|---|---|
| High | 3 (regroupés en 2 findings) | 2 | 0 |
| Medium | 4 | 3 | 1 (events.record inflation — modif client requise) |
| Low | 2 | 0 | 2 (ws CVE attente upstream, messages cooldown hors scope) |

**Détail des fixes appliqués → voir [fix-log.md](./fix-log.md).**

---

## [HIGH] Finding 1 : `social.debug*` actions exposées publiquement sans authentification

- **OWASP** : A01 (Broken Access Control) + A05 (Security Misconfiguration)
- **STRIDE** : I (Information Disclosure) + T (Tampering)
- **Location** : `convex/social.ts:1337,1376,1436,1490`
- **Confidence** : Confirmed

### Description

4 actions publiques de debug sont exposées via l'API JSON-RPC Convex sans aucun guard d'authentification ni d'autorisation :

| Action | Type | Impact |
|---|---|---|
| `debugListConnectedAccounts` | lecture | Énumère les comptes sociaux (FB Page name, IG handle, **TikTok username `@raoulalobo`**, profile pictures, tokens TTL) |
| `debugInspectZernioPosts` | lecture | Liste les N derniers posts Zernio avec contenu complet, comptes utilisés, erreurs |
| `debugGetZernioPostSingle` | lecture | Récupère n'importe quel post Zernio par ID (info disclosure cross-tenant Zernio si IDs devinés) |
| `debugSeedZernioIdAndReconcile` | **MUTATION** | Modifie `socialPosts` (zernioPostId) **sans owner check**, déclenche reconcile (GET externe + écriture `platformResults`) |

### Attack Scenario

```
1. Attaquant ouvre la console DevTools sur osy-immo.com
2. Appelle directement le client Convex JSON-RPC :
   convex.action(api.social.debugListConnectedAccounts, {})
   → Retourne : { accounts: [{ platform: "tiktok", username: "raoulalobo",
                              tokenExpiresAt: "...", profilePicture: "..." }, ...] }
3. Idem pour debugInspectZernioPosts → contenu de TOUS les posts.
4. Pour la mutation : appelle debugSeedZernioIdAndReconcile avec un propertyId
   et un zernioPostId arbitraire → corrompt la row socialPosts de la victime.
```

### Code Evidence

```ts
// convex/social.ts:1337-1356 (debugGetZernioPostSingle)
export const debugGetZernioPostSingle = action({
  args: { zernioPostId: v.string() },
  handler: async (_ctx, { zernioPostId }) => {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) return { error: "ZERNIO_API_KEY manquante." };
    // ← AUCUN guard auth ni owner
    const res = await fetch(`${ZERNIO_BASE_URL}/posts/${zernioPostId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    ...
  },
});

// convex/social.ts:1376-1424 (debugSeedZernioIdAndReconcile) — MUTATION publique
export const debugSeedZernioIdAndReconcile = action({
  args: { propertyId: v.id("properties"), zernioPostId: v.string() },
  handler: async (ctx, { propertyId, zernioPostId }) => {
    // ← AUCUN guard auth ni owner check sur propertyId
    const row = await ctx.runQuery(internal.social.getSocialPostByProperty, ...);
    await ctx.runMutation(internal.social.finalizeSocialPost, {
      id: row._id, status: row.status, zernioPostId,
    });
    ...
  },
});
```

### Mitigation

Convertir les 4 actions en **`internalAction`** — elles sont destinées aux ops via `npx convex run --prod` qui passe les auth claims automatiquement. Aucun usage frontend légitime.

```ts
// Remplacer chaque export :
-export const debugGetZernioPostSingle = action({ ... });
+export const debugGetZernioPostSingle = internalAction({ ... });
```

`npx convex run --prod social:debugGetZernioPostSingle '{...}'` continue de fonctionner pour les ops.

### Auto-fix : OUI

---

## [HIGH] Finding 2 : `properties.get` + `properties.listByOwner` leakent annonces non-publiées + PII

- **OWASP** : A01 (Broken Access Control) — IDOR + énumération
- **STRIDE** : I (Information Disclosure)
- **Location** : `convex/properties.ts:152-157` + `:163-174`
- **Confidence** : Confirmed

### Description

`properties.get(id)` retourne le document COMPLET sans aucun filtre `status` ni vérification d'owner — donc les annonces en `draft`, `sold`, `rented`, `archived` sont entièrement accessibles avec leurs PII (adresse exacte, latitude/longitude, code postal, ownerId) si on connaît leur ID.

`properties.listByOwner({ ownerId })` accepte un `ownerId` arbitraire en argument et retourne **toutes** les annonces de cet owner, y compris drafts et non-publiées.

### Attack Scenario

```
1. Attaquant appelle properties.list (public) → reçoit annonces actives AVEC leur ownerId
   (le doc complet est retourné, ownerId est un champ public dans Convex).
2. Pour chaque ownerId trouvé :
   convex.query(api.properties.listByOwner, { ownerId: "userXYZ" })
   → toutes les annonces de userXYZ, y compris drafts privés + sold + archived
3. Pour chaque annonce draft trouvée :
   convex.query(api.properties.get, { id: "..." })
   → adresse exacte + lat/lng + photos + description complète
```

Exemple concret : la propriété `jd75snq1j8t4h2f17tjx9hxt5s87h6h9` (Maison SIC Makepe) a une lat/lng `3.856794, 11.521229` (vue en image plus haut) — accessible publiquement.

### Code Evidence

```ts
// convex/properties.ts:152-157
export const get = query({
  args: { id: v.id("properties") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);  // ← AUCUN filtre status, AUCUN owner check
  },
});

// convex/properties.ts:163-174
export const listByOwner = query({
  args: { ownerId: v.optional(v.string()) },
  handler: async (ctx, { ownerId }) => {
    const id = ownerId ?? (await auth.getAuthUserId(ctx));
    // ← ownerId arbitraire accepté sans vérifier que c'est l'user courant
    if (!id) return [];
    return await ctx.db.query("properties")
      .withIndex("by_owner", (q) => q.eq("ownerId", id))
      .order("desc")
      .collect();
  },
});
```

### Mitigation

**`properties.get`** : si l'annonce n'est pas `active`, exiger que le user courant soit l'owner. Sinon retourner `null`.

```ts
export const get = query({
  args: { id: v.id("properties") },
  handler: async (ctx, { id }) => {
    const property = await ctx.db.get(id);
    if (!property) return null;
    // Public si active, owner-only sinon
    if (property.status !== "active") {
      const userId = await auth.getAuthUserId(ctx);
      if (!userId || property.ownerId !== userId) return null;
    }
    return property;
  },
});
```

**`properties.listByOwner`** : retirer le paramètre `ownerId` arbitraire — utiliser uniquement le user authentifié.

```ts
export const listByOwner = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db.query("properties")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();
  },
});
```

⚠️ **Breaking** : tous les callers de `listByOwner` doivent retirer l'argument `ownerId`. Vérification : tous les usages frontend appellent `listByOwner({})` sans `ownerId` (cf. dashboard).

### Auto-fix : OUI

---

## [HIGH] Finding 3 : `properties.listByOwner` accepte tout `ownerId`

Voir **Finding 2** ci-dessus (regroupé car même fix logique).

---

## [MEDIUM] Finding 4 : `inquiries.send` sans rate limit (DoS storage)

- **OWASP** : A04 (Insecure Design)
- **STRIDE** : D (Denial of Service)
- **Location** : `convex/inquiries.ts:19-40`
- **Confidence** : Confirmed

### Description

`inquiries.send` est public (visiteur anonyme), accepte `fromName/fromEmail/fromPhone/message` sans aucune validation de longueur, et n'a aucun rate limit applicatif. Convex limite naturellement à ~60 req/s par client = 3600 inquiries/min insérables.

### Mitigation

Implementer un rate-limit applicatif simple via une table `rateLimits` indexée par (clientId | propertyId), ou plus simple : utiliser `@convex-dev/rate-limiter` (composant officiel Convex).

Alternative MVP : rejeter les inquiries identiques (même propertyId + même fromEmail dans les 60 secondes).

```ts
export const send = mutation({
  args: {...},
  handler: async (ctx, args) => {
    // Anti-spam basique : 1 inquiry par couple (propertyId, fromEmail) / 5 min
    const cutoff = Date.now() - 5 * 60 * 1000;
    const recent = await ctx.db
      .query("inquiries")
      .withIndex("by_property", (q) =>
        q.eq("propertyId", args.propertyId).gte("_creationTime", cutoff)
      )
      .filter((q) => q.eq(q.field("fromEmail"), args.fromEmail))
      .first();
    if (recent) {
      throw new Error("Vous avez déjà contacté ce propriétaire récemment.");
    }
    // ... reste inchangé
  },
});
```

Plus la **validation de longueur** : `fromName.length > 100`, `fromEmail.length > 254`, `message.length > 5000` → reject.

### Auto-fix : OUI

---

## [MEDIUM] Finding 5 : `events.record` inflation stats + fake ambassadeurs

- **OWASP** : A04 (Insecure Design)
- **STRIDE** : T (Tampering) + D (DoS)
- **Location** : `convex/events.ts:38-82`
- **Confidence** : Confirmed

### Description

`events.record` est public, accepte `sessionHash` et `refUserId` contrôlés entièrement par le client. La dédup "view" passe par sessionHash → attaquant change la valeur à chaque req → bypass dédup. `refUserId` n'est jamais validé contre la table users → fake trafic créditable à n'importe qui.

### Attack Scenario

```
for (let i = 0; i < 1000; i++) {
  fetch('/api/...', { body: JSON.stringify({
    propertyId: 'cible',
    type: 'view',
    sessionHash: crypto.randomUUID(),  // bypass dédup
    refUserId: 'targetUser',           // crédite un ambassadeur arbitraire
  })});
}
// → Le propriétaire de "cible" voit son badge passer à 🔥 Hot
// → "targetUser" apparaît dans statsForReferrer comme top performer
```

### Mitigation

- **Server-side sessionHash** : générer côté serveur depuis IP + UA + day (HMAC), ignorer celui du client.
- **Validation `refUserId`** : vérifier que c'est un userId existant dans BetterAuth (ou silencieusement le drop).
- **Rate-limit par IP** : 60 events/min/IP via composant `@convex-dev/rate-limiter`.

### Auto-fix : Partiel (validation refUserId + cap volume — le sessionHash côté serveur exige changement architecture côté client)

---

## [MEDIUM] Finding 6 : description sans limite serveur (DoS storage)

- **OWASP** : A04 (Insecure Design)
- **STRIDE** : D (DoS)
- **Location** : `convex/properties.ts baseFields:182`
- **Confidence** : Confirmed

### Description

`description: v.string()` côté schema — pas de limite. Un user authentifié peut créer N propriétés × 1 MB description, consommant le storage Convex sans contre-mesure. Convex limite probablement les docs à ~1 MB chacun mais rien n'empêche un user de créer 100 docs maximaux.

### Mitigation

Ajouter une validation côté mutation create/update :

```ts
if (args.description.length > 5000) {
  throw new Error("Description trop longue (max 5000 caractères).");
}
if (args.title.length > 200) {
  throw new Error("Titre trop long (max 200 caractères).");
}
```

Cohérent avec `MAX_MESSAGE_LENGTH = 2000` dans messages.ts — appliquer le même pattern à toutes les mutations qui prennent du texte libre.

### Auto-fix : OUI

---

## [MEDIUM] Finding 7 : `inquiries.send` fromEmail/fromName non vérifiés (impersonation)

- **OWASP** : A07 (Identification failures) + A04 (Insecure Design)
- **STRIDE** : S (Spoofing) + R (Repudiation)
- **Location** : `convex/inquiries.ts:20-26`
- **Confidence** : Confirmed

### Description

`fromEmail` accepté sans vérification de propriété → un attaquant peut envoyer une inquiry signée "DIRECTION OSY-IMMO <ceo@osy-immo.com>" pour faire pression sur un propriétaire.

### Mitigation

Approche MVP — sans verif email visiteur (friction trop forte) : ajouter une **validation regex email** (filtrage des caractères spéciaux non-email), et **afficher un avertissement** côté UI dashboard du propriétaire : "Cette personne n'a pas confirmé son email — vérifiez avant d'engager toute action."

Approche complète : envoyer un email de confirmation au `fromEmail` avant que l'inquiry soit visible — ajout d'un état `verified: boolean`.

### Auto-fix : Validation regex uniquement (MVP). Verif email complète demande UX flow nouveau.

---

## [MEDIUM] Finding 8 : Security headers manquants (CSP, X-Frame-Options, etc.)

- **OWASP** : A05 (Security Misconfiguration)
- **STRIDE** : T (Tampering)
- **Location** : `vercel.json`
- **Confidence** : Confirmed

### Description

Vérification headers en prod (`curl -sI https://osy-immo.com/`) : seul `Strict-Transport-Security` est présent (auto par Vercel). Manquants :

- `Content-Security-Policy` — pas de défense en profondeur XSS
- `X-Frame-Options: DENY` — clickjacking possible (un attaquant peut iframer osy-immo.com)
- `X-Content-Type-Options: nosniff` — MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` — fuite Referer en cross-origin
- `Permissions-Policy` — pas de restriction caméra/micro/geolocation API

### Mitigation

Ajouter dans `vercel.json` :

```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(self)" }
    ]
  }]
}
```

CSP complète demande inventaire des origines externes (Convex, Resend, Zernio, Unsplash, Vercel Analytics) — à faire dans une seconde passe.

### Auto-fix : OUI (sans CSP — trop complexe pour auto-fix)

---

## [LOW] Finding 9 : `ws` CVE-2026-45736 (dependency moderate)

- **OWASP** : A06 (Vulnerable Components)
- **Location** : transitive de `convex>ws@8.18.0`
- **Confidence** : Confirmed (npm audit baseline)

### Description

`ws<8.20.1` peut leaker de la mémoire non initialisée via `websocket.close()` avec TypedArray. CVSS 4.4 (Medium). Impact réel limité (nécessite contrôle attaquant sur le close payload).

### Mitigation

Attendre release Convex qui bump `ws` vers ≥8.20.1. Pour l'instant : `pnpm overrides`/`resolutions` peut forcer la version, mais risque casser le client Convex.

### Auto-fix : NON (transitive, breaking potentiel)

---

## [LOW] Finding 10 : `messages.send` no per-user rate limit

- **OWASP** : A04 (Insecure Design)
- **STRIDE** : D (DoS storage)
- **Location** : `convex/messages.ts:126-179`
- **Confidence** : Confirmed

### Description

Participant authentifié peut spam la conversation à 60 msg/s. Cooldown email (5 min) limite le bruit Resend mais pas l'insertion DB.

### Mitigation

Cooldown applicatif : 1 message / 2 sec / user / conversation.

```ts
const recent = await ctx.db.query("messages")
  .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
  .order("desc").first();
if (recent && recent.fromUserId === userId && Date.now() - recent._creationTime < 2000) {
  throw new Error("Vous envoyez trop vite des messages.");
}
```

### Auto-fix : NON (Low — pas dans le scope auto-fix Critical/High demandé)
