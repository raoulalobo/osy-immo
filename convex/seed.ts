// convex/seed.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Action de seed pour remplir la base avec un jeu d'annonces démonstratif
//        adapté au marché camerounais (devise XAF, villes principales : Douala,
//        Yaoundé, Bafoussam, Limbé, Kribi, etc.).
//
// À lancer avec : `npx convex run seed:run` (ou `pnpm seed`).
//
// Sécurité : à n'utiliser qu'en environnement de développement.
// -------------------------------------------------------------------------------------------------

// NB : on utilise `mutation` (et non `internalMutation`) pour pouvoir l'invoquer
// directement via la CLI `npx convex run seed:run`. À ne PAS exposer en prod.
import { mutation } from "./_generated/server";

// Quelques images Unsplash libres de droits, suffisamment génériques pour fonctionner offline-free.
const HOUSE = "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=80";
const APT = "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80";
const APT2 = "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80";
const VILLA = "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80";
const LAND = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80";
const SHOP = "https://images.unsplash.com/photo-1604014237800-1c9102c219da?auto=format&fit=crop&w=1200&q=80";

// `run` est l'export utilisé par `pnpm seed` — c'est une mutation interne (côté serveur).
// On purge d'abord les annonces existantes puis on en insère ~8 nouvelles.
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    // Purge des annonces existantes (et de leurs favoris/inquiries en cascade)
    const existing = await ctx.db.query("properties").collect();
    for (const p of existing) await ctx.db.delete(p._id);
    const favs = await ctx.db.query("favorites").collect();
    for (const f of favs) await ctx.db.delete(f._id);
    const inqs = await ctx.db.query("inquiries").collect();
    for (const i of inqs) await ctx.db.delete(i._id);

    const now = Date.now();
    // Prix exprimés en FCFA (1€ ≈ 656 XAF). Tous les biens sont localisés au Cameroun.
    const samples = [
      {
        title: "Appartement T3 moderne à Bonapriso, Douala",
        description:
          "Bel appartement de 90m² au 3e étage avec ascenseur. Cuisine équipée, deux chambres, balcon ouvert sur le quartier résidentiel de Bonapriso. Sécurité 24/7 et parking privé.",
        type: "apartment" as const,
        listingType: "sale" as const,
        price: 75_000_000,
        surface: 90,
        rooms: 4,
        bedrooms: 2,
        bathrooms: 2,
        yearBuilt: 2019,
        address: "Rue Joffre, Bonapriso",
        city: "Douala",
        region: "Littoral",
        country: "Cameroun",
        lat: 4.0445,
        lng: 9.7012,
        images: [APT, APT2],
        features: ["ascenseur", "parking", "sécurité 24/7", "groupe électrogène"],
      },
      {
        title: "Villa 5 chambres avec piscine — Bastos, Yaoundé",
        description:
          "Splendide villa contemporaine de 320m² sur un terrain clôturé de 800m². 5 chambres en suite, salon double, piscine, jardin paysager, dépendance personnel. Quartier diplomatique de Bastos.",
        type: "house" as const,
        listingType: "sale" as const,
        price: 280_000_000,
        surface: 320,
        rooms: 8,
        bedrooms: 5,
        bathrooms: 4,
        yearBuilt: 2021,
        address: "Quartier Bastos, face Ambassade",
        city: "Yaoundé",
        region: "Centre",
        country: "Cameroun",
        lat: 3.892,
        lng: 11.51,
        images: [VILLA, HOUSE],
        features: ["piscine", "jardin", "dépendance", "groupe électrogène", "forage"],
      },
      {
        title: "Studio meublé à louer — Akwa, Douala",
        description:
          "Studio entièrement meublé de 35m² en plein centre d'Akwa. Idéal cadre, expatrié ou étudiant. Climatisation, internet fibre inclus, gardiennage.",
        type: "apartment" as const,
        listingType: "rent" as const,
        price: 250_000,
        surface: 35,
        rooms: 1,
        bedrooms: 0,
        bathrooms: 1,
        yearBuilt: 2015,
        address: "Avenue de la Liberté, Akwa",
        city: "Douala",
        region: "Littoral",
        country: "Cameroun",
        lat: 4.052,
        lng: 9.703,
        images: [APT2],
        features: ["meublé", "climatisation", "fibre", "gardiennage"],
      },
      {
        title: "Maison familiale 4 chambres — Bafoussam",
        description:
          "Maison en bon état de 180m² sur terrain de 500m². 4 chambres, grand séjour, cuisine moderne, terrasse, garage 2 voitures. Proche route de Bandjoun.",
        type: "house" as const,
        listingType: "sale" as const,
        price: 65_000_000,
        surface: 180,
        rooms: 6,
        bedrooms: 4,
        bathrooms: 2,
        yearBuilt: 2010,
        address: "Quartier Banengo",
        city: "Bafoussam",
        region: "Ouest",
        country: "Cameroun",
        lat: 5.476,
        lng: 10.418,
        images: [HOUSE],
        features: ["garage", "jardin", "terrasse"],
      },
      {
        title: "Terrain titré 1500m² vue mer — Kribi",
        description:
          "Très beau terrain titré de 1500m² à 300m de la plage. Idéal résidence secondaire ou projet hôtelier. Titre foncier disponible. Vue dégagée sur l'océan.",
        type: "land" as const,
        listingType: "sale" as const,
        price: 45_000_000,
        surface: 1500,
        address: "Route de Grand Batanga",
        city: "Kribi",
        region: "Sud",
        country: "Cameroun",
        lat: 2.946,
        lng: 9.91,
        images: [LAND],
        features: ["titre foncier", "vue mer", "viabilisé"],
      },
      {
        title: "Local commercial bord de route — Avenue Kennedy, Yaoundé",
        description:
          "Local commercial de 120m² avec vitrine sur l'Avenue Kennedy. Idéal restauration, boutique, agence. Très bon passage. Bail commercial 3/6/9.",
        type: "commercial" as const,
        listingType: "rent" as const,
        price: 750_000,
        surface: 120,
        address: "Avenue Kennedy, Centre Ville",
        city: "Yaoundé",
        region: "Centre",
        country: "Cameroun",
        lat: 3.866,
        lng: 11.516,
        images: [SHOP],
        features: ["vitrine", "centre-ville", "parking client"],
      },
      {
        title: "Duplex haut standing — Bonanjo, Douala",
        description:
          "Duplex de 220m² avec vue sur le Wouri. 4 chambres, terrasse panoramique, ascenseur privé, sécurité renforcée. Prestations haut de gamme.",
        type: "apartment" as const,
        listingType: "sale" as const,
        price: 175_000_000,
        surface: 220,
        rooms: 6,
        bedrooms: 4,
        bathrooms: 3,
        yearBuilt: 2022,
        address: "Boulevard de la Liberté, Bonanjo",
        city: "Douala",
        region: "Littoral",
        country: "Cameroun",
        lat: 4.045,
        lng: 9.687,
        images: [APT, VILLA],
        features: ["vue fleuve", "ascenseur privé", "sécurité", "domotique"],
      },
      {
        title: "Maison à rénover — Mendong, Yaoundé",
        description:
          "Maison ancienne de 140m² sur terrain de 400m² à rénover. Beau potentiel dans un quartier en plein essor. Proche université.",
        type: "house" as const,
        listingType: "sale" as const,
        price: 28_000_000,
        surface: 140,
        rooms: 5,
        bedrooms: 3,
        bathrooms: 1,
        yearBuilt: 1998,
        address: "Quartier Mendong",
        city: "Yaoundé",
        region: "Centre",
        country: "Cameroun",
        lat: 3.829,
        lng: 11.479,
        images: [HOUSE],
        features: ["à rénover", "terrain spacieux", "potentiel"],
      },
    ];

    // Insertion — `ownerId` est un faux ID textuel ; remplacer par un vrai user via BetterAuth.
    const fakeOwnerId = "seed-owner";
    for (const s of samples) {
      await ctx.db.insert("properties", {
        ownerId: fakeOwnerId,
        status: "active",
        publishedAt: now,
        ...s,
      });
    }

    return { inserted: samples.length };
  },
});
