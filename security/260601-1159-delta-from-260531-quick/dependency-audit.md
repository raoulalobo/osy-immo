# Dependency Audit Delta — 260601

## Comparaison vs 260531

Aucune nouvelle dépendance ajoutée depuis l'audit J-1. Le `package.json` est identique :
- `better-auth` 1.6.11 (inchangé)
- `convex` ^1.39.1 (inchangé, toujours porteur de `ws@8.18.0` transitive)
- `@tanstack/react-router` 1.170.3 (inchangé)
- `zod` ^4.0.0 (inchangé)

## CVE actif (rappel)

| Package | Version | Status | CVE |
|---|---|---|---|
| `ws` (via convex) | 8.18.0 | Open Low | CVE-2026-45736 (uninitialized memory disclosure, CVSS 4.4) |

Aucune nouvelle CVE détectée. Aucune nouvelle dépendance avec advisory.

**Recommandation** : surveillez les releases `convex` qui bumperont `ws ≥ 8.20.1`. Pas d'override forcé (risque de casser le client Convex en prod).
