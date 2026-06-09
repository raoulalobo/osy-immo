# Immobiliare — Marketplace immobilier

Marketplace immobilier full-stack construit avec :

- **[TanStack Start](https://tanstack.com/start)** — framework full-stack React (routing fichier-basé, SSR/streaming, server functions).
- **[Convex](https://convex.dev)** — backend temps-réel (base de données, fonctions, recherche full-text).
- **[BetterAuth](https://better-auth.com)** + [`@convex-dev/better-auth`](https://labs.convex.dev/better-auth) — authentification email/password & OAuth.
- **Tailwind CSS v4** — UI rapide à itérer.
- **Lucide** + **Sonner** — icônes et toasts.

---

## Fonctionnalités

- 🏡 Listing d'annonces immobilières (vente / location) — appartements, maisons, terrains, locaux commerciaux.
- 🔍 Recherche full-text + filtres (ville, type, prix, surface).
- ❤️ Favoris persistants par utilisateur.
- ✉️ Demandes de contact envoyées au propriétaire.
- 🧑‍💼 Espace propriétaire : CRUD d'annonces, gestion des demandes reçues.
- 🔐 Auth email/password (BetterAuth) avec session live côté React.
- ⚡ Temps réel : Convex pousse automatiquement les changements aux clients connectés.

---

## Installation

```bash
pnpm install
```

## Configuration

1. Copier le fichier d'env :

```bash
cp .env.example .env
```

2. Démarrer Convex (créé un projet si nécessaire) :

```bash
pnpm convex:dev
```

La CLI vous demande de vous connecter, puis affiche `VITE_CONVEX_URL` à coller dans `.env`.

3. Définir les variables côté Convex :

```bash
npx convex env set SITE_URL http://localhost:3000
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
# Optionnel — Google OAuth :
npx convex env set GOOGLE_CLIENT_ID "..."
npx convex env set GOOGLE_CLIENT_SECRET "..."
```

4. Charger des données de démo :

```bash
pnpm seed   # = convex run seed:run
```

## Démarrer en dev

Deux terminaux :

```bash
# Terminal 1 — backend Convex (regarde convex/ et redéploie en live)
pnpm convex:dev

# Terminal 2 — front TanStack Start (Vite + SSR)
pnpm dev
```

Ouvrir http://localhost:3000.

---

## Arborescence

```
.
├── convex/                  # Backend Convex
│   ├── schema.ts            # Tables : properties, favorites, inquiries
│   ├── convex.config.ts     # Composants montés (better-auth)
│   ├── auth.ts              # createAuth + helpers serveur (BetterAuth)
│   ├── auth.config.ts       # Providers d'auth
│   ├── http.ts              # /api/auth/* sur Convex HTTP router
│   ├── properties.ts        # Queries + mutations CRUD annonces
│   ├── favorites.ts         # Favoris (toggle, listMine, isFavorite)
│   ├── inquiries.ts         # Demandes de contact
│   └── seed.ts              # Données de démo
├── src/
│   ├── routes/              # Routes TanStack (file-based)
│   │   ├── __root.tsx       # Layout racine + ConvexProvider
│   │   ├── index.tsx        # Page d'accueil
│   │   ├── properties.index.tsx     # /properties (liste + filtres)
│   │   ├── properties.$id.tsx       # /properties/$id (détail)
│   │   ├── favorites.tsx            # /favorites
│   │   ├── dashboard.tsx            # /dashboard (espace owner)
│   │   ├── dashboard.new.tsx        # /dashboard/new (création annonce)
│   │   ├── auth.login.tsx           # /auth/login
│   │   ├── auth.register.tsx        # /auth/register
│   │   └── api/auth.$.tsx           # Catch-all /api/auth/*
│   ├── components/          # PropertyCard, SearchBar, Navbar
│   ├── lib/
│   │   ├── auth-client.ts   # BetterAuth client React
│   │   ├── auth-server.ts   # Handler proxy /api/auth -> Convex
│   │   └── utils.ts         # cn, formatPrice, formatArea
│   ├── router.tsx           # createRouter (TanStack Start)
│   └── styles.css           # Tailwind v4 + tokens design
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Scripts

| Script              | Action |
|---------------------|--------|
| `pnpm dev`          | Vite + TanStack Start (http://localhost:3000) |
| `pnpm convex:dev`   | Convex en mode dev (déploie à chaque sauvegarde) |
| `pnpm build`        | Build production |
| `pnpm typecheck`    | TypeScript en mode `--noEmit` |
| `pnpm seed`         | Insère ~8 annonces de démo dans Convex |

---

## Notes

- Le fichier `src/routeTree.gen.ts` est généré par le plugin `@tanstack/router-plugin` au premier `pnpm dev`. Il est ignoré par git.
- Le dossier `convex/_generated/` est généré par `pnpm convex:dev`. Idem, ignoré.
- Les annonces créées via le seed ont un `ownerId` fictif (`"seed-owner"`) — créez un compte puis publiez vos propres annonces pour tester le dashboard owner.

---

## Déploiement sur Vercel

Le projet est prêt pour Vercel (`vercel.json` + `api/ssr.ts` à la racine).

### 1. Préparer Convex en production

```bash
# Crée un déploiement de prod (séparé du dev) et pousse le schema/fonctions
npx convex deploy --cmd 'pnpm typecheck'

# Note l'URL de prod retournée (https://<nom>-prod.convex.cloud) — on la mettra dans Vercel.
```

Définir les variables Convex côté prod :

```bash
npx convex env set --prod SITE_URL https://<ton-app>.vercel.app
npx convex env set --prod BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
# Optionnel OAuth :
npx convex env set --prod GOOGLE_CLIENT_ID "..."
npx convex env set --prod GOOGLE_CLIENT_SECRET "..."
```

### 2. Installer & connecter Vercel CLI

```bash
pnpm dlx vercel login           # auth interactive (browser)
pnpm dlx vercel link             # lier ce dossier à un projet Vercel
```

### 3. Définir les variables d'environnement Vercel

Soit via le dashboard (`Project → Settings → Environment Variables`), soit en CLI :

```bash
# Toutes les variables suivantes en Production (et optionnellement Preview/Development)
pnpm dlx vercel env add VITE_CONVEX_URL          # https://<nom>-prod.convex.cloud
pnpm dlx vercel env add CONVEX_URL               # idem
pnpm dlx vercel env add VITE_CONVEX_SITE_URL     # https://<nom>-prod.convex.site
pnpm dlx vercel env add SITE_URL                 # https://<ton-app>.vercel.app
pnpm dlx vercel env add VITE_SITE_URL            # idem (utilisé pour og:url + getPublicUrl)
pnpm dlx vercel env add BETTER_AUTH_SECRET       # même valeur que côté Convex
```

> ⚠️ **Important** : `SITE_URL` et `VITE_SITE_URL` doivent matcher l'URL Vercel finale. Si tu lies un domaine custom, mets-le à jour ici et côté Convex (`npx convex env set --prod SITE_URL https://immobiliare.cm`).

### 4. Déployer

```bash
# Preview deployment (URL temporaire <hash>-<scope>.vercel.app)
pnpm dlx vercel

# Production deployment
pnpm dlx vercel --prod
```

### Comment ça marche

- `vercel.json` :
  - `buildCommand: pnpm build` → produit `dist/client/` + `dist/server/server.js`
  - `outputDirectory: dist/client` → les assets statiques sont servis par le CDN Vercel
  - `rewrites: /(.*)` → toute requête non-statique part vers `/api/ssr` (la fonction)
  - `functions: api/ssr.ts` → Node runtime, 1024 Mo, 30 s max (BetterAuth + Convex needs)
- `api/ssr.ts` importe `dist/server/server.js` (handler fetch Web standard) et le re-expose.
- Les routes TanStack (incluant `/api/auth/*` pour BetterAuth) sont résolues dans le handler SSR.

### Vérifier le preview WhatsApp post-déploiement

Une fois déployé sur HTTPS public :

```bash
# 1. Vérifie les meta OG dans la réponse HTML
curl -s https://<ton-app>.vercel.app/properties/<id> | grep -E 'og:|twitter:'

# 2. Force le re-scrap des crawlers (Facebook/WhatsApp partagent le même crawler)
#    via : https://developers.facebook.com/tools/debug/
#    Colle l'URL et clique "Scrape Again".

# 3. Partage le lien dans WhatsApp Web — la carte preview doit apparaître.
```
