# OWASP Top 10 Coverage Matrix — 260531

| ID | Category | Tested | Findings | Status |
|----|----------|--------|----------|--------|
| A01 | Broken Access Control | ✓ | 2 High (debug actions + properties.get/listByOwner IDOR) | ⚠️ |
| A02 | Cryptographic Failures | partial | 0 — secrets en env vars OK, BetterAuth gère JWT/sessions | ✅ |
| A03 | Injection | ✓ | 0 — Convex Validators bloquent, React échappe, esc() emails | ✅ |
| A04 | Insecure Design | ✓ | 4 (inquiries spam, events inflation, description no limit, messages spam) | ⚠️ |
| A05 | Security Misconfiguration | ✓ | 2 (headers manquants, debug actions exposées) | ⚠️ |
| A06 | Vulnerable Components | ✓ | 1 Low (ws CVE-2026-45736) | ✅ |
| A07 | Auth & Identification Failures | ✓ | 1 Medium (inquiries fromEmail unverified) | ⚠️ |
| A08 | Software & Data Integrity Failures | partial | 0 — pas de CI/CD signing, mais code revu | 🟡 |
| A09 | Security Logging & Monitoring | partial | 0 — logs Convex existent, pas d'alerting | 🟡 |
| A10 | Server-Side Request Forgery | ✓ | 0 — URLs externes hardcodées (Zernio, Resend) | ✅ |

**Couverture : 10/10 catégories effleurées · 7/10 catégories testées en profondeur**

## STRIDE Coverage

| Threat | Tested | Findings |
|---|---|---|
| **S**poofing | ✓ | 1 Medium (inquiries fromEmail) |
| **T**ampering | ✓ | 2 (events inflation, headers absents) |
| **R**epudiation | partial | 1 Medium (inquiries traceability) |
| **I**nformation Disclosure | ✓ | 2 High (debug actions, properties.get/listByOwner) |
| **D**enial of Service | ✓ | 4 (inquiries, events, description, messages) |
| **E**levation of Privilege | ✓ | 1 High (debug seedZernioId mutation sans owner check) |

**Couverture : 6/6 catégories STRIDE testées**

## Detail per category

### A01 — Broken Access Control

- ✅ Tested : IDOR sur properties.get / listByOwner → 2 findings
- ✅ Tested : Owner checks dans mutations properties.update / properties.remove / inquiries.markRead / messages.* → OK
- ✅ Tested : Participant checks dans messages.getThread / send / markRead → OK
- ⚠️ Tested : 4 actions `social.debug*` sans guard auth → FINDING

### A03 — Injection

- ✅ Tested : Convex Validators (`v.string()`, `v.id(...)`) bloquent type confusion
- ✅ Tested : React échappement par défaut → pas de XSS direct
- ✅ Tested : `esc()` dans tous les templates email Resend
- ✅ Tested : Pas d'usage de SQL raw / shell exec / template engine custom

### A07 — Authentication

- ✅ Tested : BetterAuth gère JWT / sessions / OAuth Google / reset password
- ✅ Tested : `requireEmailVerification: true` enforcé
- ✅ Tested : minPasswordLength 8 (OWASP recommande min 8) — pourrait être 12
- ⚠️ Tested : `inquiries.fromEmail` non vérifié → FINDING

### A05 — Security Misconfiguration

- ⚠️ Tested : Headers prod incomplets → FINDING
- ⚠️ Tested : `social.debug*` actions exposées en prod → FINDING
- ✅ Tested : CORS désactivé sur Convex HTTP (`cors: false`) car proxy same-origin
- ✅ Tested : Pas de mode debug Vite en prod (déploiement vercel build = mode production)
