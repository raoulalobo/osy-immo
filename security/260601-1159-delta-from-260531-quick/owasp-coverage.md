# OWASP Coverage Delta — 260601

Audit incrémental — couverture FOCALISÉE sur les nouvelles surfaces, pas re-couverture complète.

| ID | Category | Testé ? | Nouveau finding | Status |
|----|----------|--------|----------|--------|
| A01 | Broken Access Control | ✓ | 0 | ✅ aucune régression (draft owner-only, social.debug* internalAction) |
| A02 | Cryptographic Failures | partial | 0 | ✅ pas de nouveau secret |
| A03 | Injection | ✓ | 0 | ✅ React échappe les buckets stats — pas de XSS via referrerSource |
| A04 | Insecure Design | ✓ | **2** | ⚠️ referrerSource sans whitelist (M) + limit sans cap (L) |
| A05 | Security Misconfiguration | partial | 0 | ✅ headers Vercel actifs |
| A06 | Vulnerable Components | reuse baseline | 0 | (ws CVE-2026-45736 toujours présent — non aggravé) |
| A07 | Identification & Auth | partial | 0 | ✅ aucun changement auth flow |
| A08 | Software Integrity | n/a | 0 | n/a sur ce delta |
| A09 | Logging & Monitoring | n/a | 0 | n/a sur ce delta |
| A10 | SSRF | n/a | 0 | n/a sur ce delta |

## STRIDE Coverage Delta

| Threat | Nouveau finding |
|---|---|
| **S**poofing | 0 |
| **T**ampering | 1 (referrerSource → pollution stats) |
| **R**epudiation | 0 |
| **I**nfo Disclosure | 0 |
| **D**enial of Service | 2 (referrerSource long string + limit arg uncapped) |
| **E**levation of Privilege | 0 |

## Conclusion couverture

L'audit delta s'est concentré sur **A04 (Insecure Design)** — c'est là que les nouveaux risques apparaissent quand on ajoute du tracking client-driven (referrerSource) et des queries avec paramètres flexibles (listSimilar avec limit). Les couches A01/A03/A07 sont restées stables grâce aux patterns établis (auth.getAuthUserId, React échappement, validators Convex).
