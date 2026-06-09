# Recommendations — Priorisées par effort × impact

## Priority 1 — High (Fix immédiat, auto-fix possible)

### 1. Convertir les 4 actions `social.debug*` en `internalAction` ⏱️ 5 min

**Finding** : [Finding 1](./findings.md#high-finding-1)
**Effort** : 5 minutes (remplacer 4 mots-clés)
**Impact** : ferme la fuite massive Zernio accounts/posts et la mutation seedZernioId non-autorisée

```diff
-export const debugGetZernioPostSingle = action({
+export const debugGetZernioPostSingle = internalAction({

-export const debugSeedZernioIdAndReconcile = action({
+export const debugSeedZernioIdAndReconcile = internalAction({

-export const debugInspectZernioPosts = action({
+export const debugInspectZernioPosts = internalAction({

-export const debugListConnectedAccounts = action({
+export const debugListConnectedAccounts = internalAction({
```

⚠️ **Adapter les imports** : si `action` n'est plus utilisé ailleurs après ce changement, l'enlever de l'import. Vérifier que les usages ops via `npx convex run --prod` fonctionnent encore (les `internalAction` s'invoquent aussi via run).

### 2. Filtrer `properties.get` pour les non-actives + restreindre `listByOwner` ⏱️ 10 min

**Finding** : [Finding 2](./findings.md#high-finding-2)
**Effort** : 10 minutes
**Impact** : ferme l'énumération PII (adresse, lat/lng) des annonces draft/sold/archived

```diff
// convex/properties.ts:152
 export const get = query({
   args: { id: v.id("properties") },
   handler: async (ctx, { id }) => {
-    return await ctx.db.get(id);
+    const property = await ctx.db.get(id);
+    if (!property) return null;
+    // Public si active, owner-only sinon
+    if (property.status !== "active") {
+      const userId = await auth.getAuthUserId(ctx);
+      if (!userId || property.ownerId !== userId) return null;
+    }
+    return property;
   },
 });

// convex/properties.ts:163
 export const listByOwner = query({
-  args: { ownerId: v.optional(v.string()) },
-  handler: async (ctx, { ownerId }) => {
-    const id = ownerId ?? (await auth.getAuthUserId(ctx));
-    if (!id) return [];
+  args: {},
+  handler: async (ctx) => {
+    const userId = await auth.getAuthUserId(ctx);
+    if (!userId) return [];
     return await ctx.db
       .query("properties")
-      .withIndex("by_owner", (q) => q.eq("ownerId", id))
+      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
       .order("desc")
       .collect();
   },
 });
```

⚠️ **Breaking côté frontend** : vérifier que tous les callers utilisent `listByOwner({})` sans argument. Tous les usages observés dans `dashboard.index.tsx` passent `{}` → OK.

---

## Priority 2 — Medium (Fix sprint)

### 3. Anti-spam basique sur `inquiries.send` ⏱️ 10 min

**Finding** : [Finding 4](./findings.md#medium-finding-4)
**Effort** : 10 minutes
**Impact** : empêche le flood DB par visiteur anonyme

Voir snippet dans la section finding. Ajout d'un cooldown 5 min par couple (propertyId, fromEmail) + validation de longueur sur fromName/fromEmail/message.

### 4. Validation longueur sur properties.create/update ⏱️ 5 min

**Finding** : [Finding 6](./findings.md#medium-finding-6)
**Effort** : 5 minutes
**Impact** : empêche les descriptions de 1 MB

```ts
function validateTextLengths(args: { title: string; description: string }) {
  if (args.title.length > 200) throw new Error("Titre trop long (max 200 caractères).");
  if (args.description.length > 5000) throw new Error("Description trop longue (max 5000 caractères).");
}

// Dans create + update handler :
validateTextLengths(args /* ou patch */);
```

Cohérent avec le compteur frontend déjà en place (qui informe à partir de 400 chars sur la troncature réseaux sociaux — mais le hard limit serveur reste à 5000).

### 5. Security headers Vercel ⏱️ 5 min

**Finding** : [Finding 8](./findings.md#medium-finding-8)
**Effort** : 5 minutes
**Impact** : défense en profondeur contre clickjacking + MIME sniff + referrer leak

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

CSP complète demande inventaire des origines externes (Convex `*.convex.cloud`, Resend, Zernio, Unsplash, Vercel Analytics) → seconde passe.

### 6. Validation `events.record` (refUserId + sessionHash) ⏱️ 15 min

**Finding** : [Finding 5](./findings.md#medium-finding-5)
**Effort** : 15 min
**Impact** : empêche inflation stats + fake ambassadeurs

- Valider `refUserId` contre la table users (drop silencieux si inexistant) → préserver les stats honnêtes
- Cap volumique : max 100 events / propertyId / minute via composant rate-limiter
- Server-side sessionHash : à faire dans une passe future (modif côté client requise)

### 7. Validation regex `inquiries.fromEmail` ⏱️ 5 min

**Finding** : [Finding 7](./findings.md#medium-finding-7)
**Effort** : 5 min
**Impact** : bloque les valeurs non-email

```ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!EMAIL_RE.test(args.fromEmail)) {
  throw new Error("Email invalide.");
}
```

---

## Priority 3 — Low (Backlog)

### 8. CVE `ws` — surveiller release Convex

**Finding** : [Finding 9](./findings.md#low-finding-9)
Pas d'action immédiate, attendre `convex` bump.

### 9. Rate limit messages.send (2s/msg/user/conv)

**Finding** : [Finding 10](./findings.md#low-finding-10)
Cooldown applicatif simple, voir snippet finding.

---

## Out of scope

- **CSP complète** : demande inventaire des origines, fait dans une passe dédiée.
- **MFA admin** : pas d'admin role distinct actuellement — backlog.
- **WAF / DDoS protection** : géré par Vercel/Convex de façon transparente, pas d'action code.
- **Audit logs** : implémentation custom à venir si exigence compliance.
