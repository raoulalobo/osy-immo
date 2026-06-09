// convex/ai.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Assistant IA de rédaction d'annonces immobilières.
//        Génère un TITRE accrocheur + une DESCRIPTION professionnelle à partir
//        des quelques éléments déjà saisis par l'utilisateur dans le formulaire
//        (type de bien, prix, surface, ville, équipements…) + des options de
//        style (ton, longueur). Destiné aux propriétaires "en panne
//        d'inspiration" qui veulent une annonce pro en un clic.
//
// Pourquoi une `action` (et pas une `mutation`) ?
//   - Les mutations Convex ne peuvent PAS faire d'appel HTTP externe (design
//     transactionnel/déterministe). On appelle l'API DeepSeek via `fetch()`,
//     donc une `action`. Même pattern que `convex/emails.ts` (Resend) et
//     `convex/social.ts` (Zernio).
//   - `fetch()` est dispo dans le runtime Convex par défaut → PAS besoin de
//     "use node" (et on ne le met surtout pas, ce fichier reste compatible
//     avec le runtime standard).
//
// DeepSeek = API compatible OpenAI :
//   POST https://api.deepseek.com/chat/completions
//   Authorization: Bearer <DEEPSEEK_API_KEY>
//   Modèle texte uniquement (deepseek-chat) — PAS de vision, on génère donc
//   à partir des champs texte, pas des photos.
//
// Configuration (env Convex, pas dans .env du front) :
//   npx convex env set DEEPSEEK_API_KEY sk-...
//   npx convex env set DEEPSEEK_MODEL deepseek-chat   (optionnel, défaut ci-dessous)
//
// Anti-abus : rate-limit par utilisateur (table `aiUsage`, fenêtre glissante 1h)
//   via la mutation interne `checkAndBumpQuota`. Protège le budget DeepSeek.
// -------------------------------------------------------------------------------------------------

import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// Endpoint DeepSeek (compatible OpenAI Chat Completions).
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

// Modèle par défaut si DEEPSEEK_MODEL n'est pas défini en env Convex.
const DEFAULT_MODEL = "deepseek-chat";

// Rate-limit : nombre maximum de générations autorisées par utilisateur sur
// une fenêtre glissante d'1 heure. Au-delà → erreur lisible côté front.
const RATE_LIMIT_PER_HOUR = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure en millisecondes

// Garde-fous de longueur — alignés sur `validateTextLengths` (convex/properties.ts)
// pour que la sortie IA passe toujours la validation de `properties.create/update`.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

// ---------------------------------------------------------------------------
// Validators réutilisés (ton + longueur) — exportés pour cohérence éventuelle
// ---------------------------------------------------------------------------

// Ton de rédaction demandé. Chaque valeur mappe une consigne de style dans le prompt.
const toneValidator = v.union(
  v.literal("professionnel"), // neutre, factuel, sérieux
  v.literal("chaleureux"),    // accueillant, orienté famille / coup de cœur
  v.literal("luxe"),          // haut de gamme, prestige, vocabulaire raffiné
  v.literal("investisseur")   // ROI, rendement locatif, argument financier
);

// Longueur cible de la description.
const lengthValidator = v.union(
  v.literal("court"), // ~1 paragraphe
  v.literal("moyen"), // ~2-3 paragraphes
  v.literal("long")   // ~4 paragraphes
);

// ---------------------------------------------------------------------------
// Helpers de prompt
// ---------------------------------------------------------------------------

// Mappe le ton choisi vers une consigne de style explicite pour le modèle.
function toneInstruction(tone: string): string {
  switch (tone) {
    case "chaleureux":
      return "Adopte un ton chaleureux et accueillant, qui donne envie de s'y projeter en famille.";
    case "luxe":
      return "Adopte un ton haut de gamme et prestigieux, vocabulaire raffiné, met en avant le standing.";
    case "investisseur":
      return "Adopte un ton orienté investisseur : insiste sur le potentiel locatif, le rendement et la valeur patrimoniale.";
    case "professionnel":
    default:
      return "Adopte un ton professionnel, clair et factuel, comme une agence immobilière sérieuse.";
  }
}

// Mappe la longueur choisie vers une consigne concrète (nombre de paragraphes).
function lengthInstruction(length: string): string {
  switch (length) {
    case "court":
      return "Rédige une description COURTE : 1 paragraphe percutant (~40-60 mots).";
    case "long":
      return "Rédige une description LONGUE et détaillée : environ 4 paragraphes (~150-200 mots).";
    case "moyen":
    default:
      return "Rédige une description de longueur MOYENNE : 2 à 3 paragraphes (~90-130 mots).";
  }
}

// Traduit le type de bien (enum technique) en libellé français lisible.
function typeLabel(type: string): string {
  switch (type) {
    case "apartment":
      return "appartement";
    case "house":
      return "maison";
    case "land":
      return "terrain";
    case "commercial":
      return "local commercial";
    default:
      return type;
  }
}

// Prompt système : cadre le rôle du modèle et FORCE une sortie JSON stricte
// { "title": "...", "description": "..." } pour un parsing fiable côté serveur.
const SYSTEM_PROMPT = [
  "Tu es un rédacteur expert en annonces immobilières au Cameroun.",
  "Tu écris en français, pour un public camerounais.",
  "Les prix sont exprimés en FCFA.",
  "Règles STRICTES :",
  "- N'invente JAMAIS de caractéristiques non fournies (pas de fausse piscine, fausse surface, etc.).",
  "- Le titre doit être accrocheur et tenir sur une seule ligne (max ~120 caractères).",
  "- N'utilise pas de superlatifs mensongers ni de fausses promesses.",
  "- Réponds UNIQUEMENT avec un objet JSON valide de la forme :",
  '  {"title": "...", "description": "..."}',
  "- N'ajoute aucun texte avant ou après le JSON.",
].join("\n");

// Type des arguments connus du bien (réutilisé par buildUserPrompt).
type ListingArgs = {
  type: string;
  listingType: string;
  price: number;
  surface: number;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  city: string;
  region?: string;
  features: string[];
  keywords?: string;
  tone: string;
  length: string;
};

// Construit le message utilisateur : liste à puces des éléments connus du bien
// + consignes de ton et de longueur. Seules les valeurs réellement fournies
// sont incluses, pour ne pas pousser le modèle à inventer.
function buildUserPrompt(args: ListingArgs): string {
  const transaction = args.listingType === "rent" ? "à louer" : "à vendre";
  const lignes: string[] = [
    `Type de bien : ${typeLabel(args.type)} ${transaction}`,
    `Prix : ${args.price.toLocaleString("fr-FR")} FCFA${
      args.listingType === "rent" ? " / mois" : ""
    }`,
    `Surface : ${args.surface} m²`,
    `Ville : ${args.city}`,
  ];

  // Champs optionnels — ajoutés seulement s'ils sont renseignés.
  if (args.region) lignes.push(`Région : ${args.region}`);
  if (args.rooms !== undefined) lignes.push(`Nombre de pièces : ${args.rooms}`);
  if (args.bedrooms !== undefined)
    lignes.push(`Chambres : ${args.bedrooms}`);
  if (args.bathrooms !== undefined)
    lignes.push(`Salles de bain : ${args.bathrooms}`);
  if (args.features.length > 0)
    lignes.push(`Équipements / atouts : ${args.features.join(", ")}`);
  if (args.keywords && args.keywords.trim())
    lignes.push(`Ambiance / mots-clés souhaités : ${args.keywords.trim()}`);

  return [
    "Voici les informations sur le bien immobilier :",
    "",
    ...lignes.map((l) => `- ${l}`),
    "",
    toneInstruction(args.tone),
    lengthInstruction(args.length),
    "",
    "Génère un titre accrocheur et une description vendeuse à partir de ces informations.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Rate-limit : mutation interne (a accès à la base, contrairement à l'action)
//
// Dérive l'identité côté serveur (PAS de userId passé en argument — règle de
// sécurité Convex). Le contexte d'auth est propagé depuis l'action appelante.
//
// Logique "fenêtre glissante simple" :
//   - Pas de ligne / fenêtre expirée → on (ré)initialise : count=1, windowStart=now.
//   - Fenêtre encore active mais count >= LIMIT → throw (quota atteint).
//   - Sinon → count++.
// ---------------------------------------------------------------------------
export const checkAndBumpQuota = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Identité dérivée serveur — jamais reçue en argument.
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) throw new Error("Authentification requise.");

    // `Date.now()` est autorisé dans une mutation (déterminisme géré par Convex).
    const now = Date.now();

    // 1 seule ligne par utilisateur grâce à l'index by_user.
    const existing = await ctx.db
      .query("aiUsage")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    // Pas de ligne OU fenêtre expirée → reset propre de la fenêtre.
    if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
      if (existing) {
        await ctx.db.patch(existing._id, { count: 1, windowStart: now });
      } else {
        await ctx.db.insert("aiUsage", { userId, count: 1, windowStart: now });
      }
      return null;
    }

    // Fenêtre active : on vérifie le plafond avant d'incrémenter.
    if (existing.count >= RATE_LIMIT_PER_HOUR) {
      throw new Error(
        `Limite de ${RATE_LIMIT_PER_HOUR} générations par heure atteinte. Réessaie un peu plus tard.`
      );
    }
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Action publique : génère { title, description } via DeepSeek.
//
// Appelée depuis le front : const generate = useAction(api.ai.generateListing).
//
// Flux :
//   1) Vérifie la config (DEEPSEEK_API_KEY) → erreur claire si absente.
//   2) Auth : exige un utilisateur connecté.
//   3) Rate-limit : runMutation(internal.ai.checkAndBumpQuota) (throw si quota).
//   4) Appel HTTP DeepSeek (JSON strict) → parse → tronque aux limites serveur.
// ---------------------------------------------------------------------------
export const generateListing = action({
  args: {
    // Éléments connus du bien (mêmes types que le formulaire / properties.create).
    type: v.union(
      v.literal("apartment"),
      v.literal("house"),
      v.literal("land"),
      v.literal("commercial")
    ),
    listingType: v.union(v.literal("sale"), v.literal("rent")),
    price: v.number(),
    surface: v.number(),
    rooms: v.optional(v.number()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    city: v.string(),
    region: v.optional(v.string()),
    features: v.array(v.string()),
    // Texte libre optionnel pour orienter le ton / le contexte.
    keywords: v.optional(v.string()),
    // Options de style avancées.
    tone: toneValidator,
    length: lengthValidator,
  },
  handler: async (
    ctx,
    args
  ): Promise<{ title: string; description: string }> => {
    // 1) Config — fail-fast avec un message actionnable (cf. emails.ts:sendViaResend).
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error(
        "IA non configurée : ajoute la clé avec `npx convex env set DEEPSEEK_API_KEY sk-...`"
      );
    }

    // 2) Auth — un utilisateur connecté uniquement.
    const userId = await auth.getAuthUserId(ctx);
    if (!userId) throw new Error("Authentification requise.");

    // 3) Rate-limit (throw si quota dépassé). On délègue à la mutation interne
    //    car l'action n'a pas accès à la base. Annotation de type explicite
    //    requise pour les appels intra-fichier (limitation TS de Convex).
    await ctx.runMutation(internal.ai.checkAndBumpQuota, {});

    // 4) Appel DeepSeek (Chat Completions, compatible OpenAI).
    const model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
    let res: Response;
    try {
      res = await fetch(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(args) },
          ],
          temperature: 0.8, // un peu de créativité pour varier les régénérations
          // Force une réponse JSON pure → parsing fiable sans regex fragile.
          response_format: { type: "json_object" },
        }),
      });
    } catch (err: any) {
      // Erreur réseau (DNS, timeout, etc.) — distincte d'une 4xx/5xx.
      throw new Error(
        `Impossible de joindre DeepSeek : ${err?.message ?? err}`
      );
    }

    if (!res.ok) {
      // On remonte le statut + un extrait du corps (tronqué pour éviter de
      // leaker un éventuel reflect de la clé / payload trop long).
      const body = await res.text().catch(() => "");
      throw new Error(
        `DeepSeek a renvoyé une erreur ${res.status} : ${body.slice(0, 200)}`
      );
    }

    // Réponse OpenAI-like : choices[0].message.content contient notre JSON.
    const data: any = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Réponse DeepSeek vide ou inattendue.");
    }

    // Parse du JSON { title, description }. response_format=json_object garantit
    // normalement un JSON valide, mais on protège quand même le parse.
    let parsed: { title?: unknown; description?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Réponse DeepSeek illisible (JSON invalide).");
    }

    const title =
      typeof parsed.title === "string" ? parsed.title.trim() : "";
    const description =
      typeof parsed.description === "string" ? parsed.description.trim() : "";
    if (!title || !description) {
      throw new Error("DeepSeek n'a pas renvoyé de titre/description exploitables.");
    }

    // Garde-fous de longueur — alignés sur les limites de properties.create
    // pour que la sauvegarde ne soit jamais rejetée par validateTextLengths.
    return {
      title: title.slice(0, TITLE_MAX),
      description: description.slice(0, DESCRIPTION_MAX),
    };
  },
});
