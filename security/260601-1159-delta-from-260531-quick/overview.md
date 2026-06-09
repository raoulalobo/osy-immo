# Security Audit Delta — 260601-1159

**Type** : audit incrémental (`--diff` depuis 260531-1257)
**Profondeur** : Quick scan (5 itérations)
**Action** : Rapport + auto-fix Critical/High (rien à fixer ce passage)
**Duration** : ~10 minutes

## Summary

- **Total Findings** : **2 actionables** (0 Critical · 0 High · 1 Medium · 1 Low)
- **Auto-fix appliqués** : **0** (aucun Critical/High détecté)
- **STRIDE Coverage Delta** : T (1) + D (2) — couverture focalisée sur les nouvelles surfaces
- **OWASP Coverage Delta** : A04 principalement (Insecure Design — pattern des nouveaux ajouts)

## Top findings

1. [**[MEDIUM] `referrerSource` accepté sans whitelist**](./findings.md#medium-finding-1) — la mutation `events.record` ne valide pas le bucket envoyé par le client → pollution analytique (faux buckets fictifs visibles dans le breakdown sources owner) + storage DoS si long string. Pas de XSS (React échappe).

2. [**[LOW] `limit` arg sans cap maximum**](./findings.md#low-finding-2) — 3 queries publiques (`list`, `search`, `listSimilar`) acceptent un `limit` non borné → potentiel DoS query si attaquant envoie 100k.

## Delta vs J-1 (260531-1257)

| Statut | Count |
|---|---|
| **Nouveaux findings** | 2 |
| **Fixés depuis J-1** | 5 (auto-fix J-1) |
| **Recurring (héritage J-1)** | 3 (events.record inflation, ws CVE, messages rate limit) |
| **Décisions UX validées** | 1 (`properties.get` public pour sold/rented/archived) |

## Verdict

**Aucune régression critique** introduite par les changements du jour (listSimilar, OwnerPanel, StatusBanner, classifyReferrer, SimilarPropertiesSection, agrégation socialPosts, setAsPrimary image principale, skeletons UI, label FCFA, compteur description). Les nouvelles surfaces ajoutent **2 trous mineurs** (1 M + 1 L) tous deux dans la catégorie A04 (Insecure Design) — typiques de l'ajout de tracking client-driven.

**Posture globale équivalente à J-1** : 0 Critical, 0 High, 1 Medium (différent), 2 Low. Les 5 corrections du précédent audit (debug actions, properties.get, listByOwner, inquiries anti-spam, security headers) tiennent toujours.

## Fichiers du rapport

- [Threat Model Delta](./threat-model.md) — fichiers modifiés + vecteurs ciblés
- [Attack Surface Map Delta](./attack-surface-map.md) — nouvelles surfaces + abuse paths
- [Findings](./findings.md) — 2 findings actionables + 1 info (décision UX)
- [OWASP Coverage Delta](./owasp-coverage.md) — couverture focalisée
- [Dependency Audit Delta](./dependency-audit.md) — aucune nouvelle dep, ws CVE inchangé
- [Recommendations](./recommendations.md) — fixes ~15 min total
- [Fix Log](./fix-log.md) — 0 fix appliqué (cohérent avec auto-fix Critical/High)
- [Iteration Log TSV](./security-audit-results.tsv) — 5 itérations détaillées

## Pour aller plus loin

Si vous souhaitez fermer les 2 findings restants (5 min Medium + 10 min Low), demandez explicitement :

> "applique les fixes audit delta 260601"

Je peux aussi rouvrir l'audit en mode `Standard (15 it)` pour re-couvrir les 3 findings héritage J-1 si vous voulez les fixer architecturalement (events server-side sessionHash + composant rate-limiter Convex).
