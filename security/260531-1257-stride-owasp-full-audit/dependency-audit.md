# Dependency Audit — 260531

## Outil : `pnpm audit --json`

### Résumé

| Sévérité | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Moderate | **1** |
| Low | 0 |
| Info | 0 |

**308 dépendances directes + transitives auditées.**

### Détail des CVEs

#### CVE-2026-45736 — `ws<8.20.1` Uninitialized memory disclosure (Moderate)

- **Advisory** : [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)
- **CVSS** : 4.4 (AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:N/A:N)
- **Chemin** : `.>convex>ws@8.18.0`
- **Impact** : `websocket.close()` peut leaker de la mémoire non-initialisée si un `TypedArray` est passé en raison. Selon le mainteneur, "actual severity is believed to be low, as the flaw is only exploitable through misuse that is unlikely in practice".

### Recommandation

- **Court terme** : aucune action — la mise à jour est transitive (via `convex` package).
- **Moyen terme** : surveiller les releases `convex` qui bumperont `ws ≥ 8.20.1`.
- **Override de force** (déconseillé pour MVP) :
  ```json
  // package.json
  "pnpm": { "overrides": { "ws": "^8.20.1" } }
  ```

## Dependencies notables (review manuelle)

| Package | Version | Note sécurité |
|---|---|---|
| `better-auth` | 1.6.11 | À jour, géré activement (auth-as-a-service) |
| `convex` | ^1.39.1 | Backend managé, secrets en env vars |
| `@tanstack/react-router` | 1.170.3 | Framework Vite, pas de sink HTML connu |
| `react` | ^19.0.0 | Échappement JSX par défaut OK |
| `zod` | ^4.0.0 | Validation côté schemas Zod et Convex validators |
| `vite` | ^7.0.0 | Dev server uniquement, prod = static + SSR Vercel |

Aucune dep avec CVE high/critical actif. Aucune dep abandonnée (pas de "Last publish > 2 years ago").
