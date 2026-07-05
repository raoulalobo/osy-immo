// src/components/PropertyForm.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Formulaire générique de création/édition d'une annonce immobilière.
//        Extrait depuis `dashboard.new.tsx` pour être réutilisé en édition
//        (`dashboard.edit.$id.tsx`), sans dupliquer ~300 lignes de JSX/state.
//
// Modes :
//   - "create" → appelle `api.properties.create` puis redirige vers la page détail.
//   - "edit"   → appelle `api.properties.update` (patch complet) puis redirige
//                vers le dashboard.
//
// Notes d'implémentation :
//   - Le state est typé sous forme de strings (cohérent avec les <input>) ;
//     conversion en number/undefined uniquement au moment du submit.
//   - Le prop `initial` permet de pré-remplir les champs (utile en édition).
//     Tous les champs sont optionnels — les valeurs par défaut sont appliquées
//     pour la création.
//   - En mode "edit", le champ status n'est PAS modifié ici (le toggle
//     draft/active est géré par le bouton "Publier" du dashboard).
// -------------------------------------------------------------------------------------------------

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Share2, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MediaUploader } from "~/components/MediaUploader";
import { Select } from "~/components/Select";
import { SOCIAL_CAPTION_DESCRIPTION_MAX } from "~/lib/social-limits";
import { cn } from "~/lib/utils";

// Régions du Cameroun (ordre alphabétique). Source : découpage administratif officiel.
const CAMEROON_REGIONS = [
  "Adamaoua",
  "Centre",
  "Est",
  "Extrême-Nord",
  "Littoral",
  "Nord",
  "Nord-Ouest",
  "Ouest",
  "Sud",
  "Sud-Ouest",
] as const;

// State local du formulaire. Tous les champs sont strings (sauf images/videos)
// pour matcher l'API des <input> et permettre les valeurs vides.
export type PropertyFormState = {
  title: string;
  description: string;
  type: "apartment" | "house" | "land" | "commercial";
  listingType: "sale" | "rent";
  price: string;
  surface: string;
  rooms: string;
  bedrooms: string;
  bathrooms: string;
  yearBuilt: string;
  energyClass: string;
  address: string;
  city: string;
  postalCode: string;
  region: string;
  country: string;
  lat: string;
  lng: string;
  images: string[];
  videos: string[];
  featuresText: string; // CSV — converti en array au submit
  // Modalités de paiement flexibles (vente uniquement — masquées si "rent").
  // Booléen = badge sur l'annonce ; texte libre optionnel affiché en détail.
  // buildPayload() n'envoie le texte que si la case correspondante est cochée.
  acceptsInstallments: boolean; // paiement en tranches accepté
  installmentDetails: string;   // ex. « 40% à la signature, solde sur 12 mois »
  acceptsExchange: boolean;     // échange/troc accepté (ex. terrain contre voiture)
  exchangeDetails: string;      // ce que le vendeur accepte en échange
  // Choix du média publié sur les réseaux sociaux (FB + IG + TikTok via Zernio).
  // - "images" (défaut) : carrousel des images
  // - "video" : 1ère vidéo (videos[0]) en post vidéo natif
  // Le radio dans le form n'autorise "video" que si videos.length > 0.
  socialMediaChoice: "images" | "video";
};

// Valeurs par défaut pour le mode création (contexte Cameroun).
const DEFAULT_STATE: PropertyFormState = {
  title: "",
  description: "",
  type: "apartment",
  listingType: "sale",
  price: "",
  surface: "",
  rooms: "",
  bedrooms: "",
  bathrooms: "",
  yearBuilt: "",
  energyClass: "",
  address: "",
  city: "",
  postalCode: "",
  region: "Centre",
  country: "Cameroun",
  lat: "",
  lng: "",
  images: [],
  videos: [],
  featuresText: "",
  acceptsInstallments: false,
  installmentDetails: "",
  acceptsExchange: false,
  exchangeDetails: "",
  socialMediaChoice: "images",
};

export interface PropertyFormProps {
  mode: "create" | "edit";
  // En mode "edit" : id de la propriété à patcher. Ignoré en "create".
  propertyId?: Id<"properties">;
  // Valeurs initiales (édition). Fusionnées avec DEFAULT_STATE.
  initial?: Partial<PropertyFormState>;
  // CTA principal — libellé du bouton submit.
  // Défauts : "Créer l'annonce" / "Enregistrer les modifications".
  submitLabel?: string;
  // Statut actuel de la propriété (mode "edit" uniquement). Si === "active",
  // on affiche en plus un bouton "Enregistrer & re-publier sur les réseaux"
  // (utile après une modif de prix / photos pour notifier les followers).
  // Inutile en mode "create" (l'annonce est en draft, pas encore active).
  currentStatus?: string;
}

export function PropertyForm({
  mode,
  propertyId,
  initial,
  submitLabel,
  currentStatus,
}: PropertyFormProps) {
  const navigate = useNavigate();
  // Une seule des deux mutations sera utilisée — on hook les deux pour respecter
  // les règles des hooks React (ordre stable).
  const create = useMutation(api.properties.create);
  const update = useMutation(api.properties.update);
  // useAction (vs useMutation) car republishToSocials fait des appels HTTP
  // externes (Zernio) en plus de mutations DB.
  const republish = useAction(api.social.republishToSocials);
  // useAction car generateListing appelle l'API DeepSeek (HTTP externe) côté
  // serveur Convex. Voir convex/ai.ts. Retourne { title, description }.
  const generate = useAction(api.ai.generateListing);

  const [form, setForm] = useState<PropertyFormState>({
    ...DEFAULT_STATE,
    ...initial,
  });

  // -------------------------------------------------------------------
  // État de l'assistant IA (génération titre + description via DeepSeek)
  // -------------------------------------------------------------------
  // Ton de rédaction demandé (mappé en consigne de style côté backend).
  const [aiTone, setAiTone] = useState<
    "professionnel" | "chaleureux" | "luxe" | "investisseur"
  >("professionnel");
  // Longueur cible de la description générée.
  const [aiLength, setAiLength] = useState<"court" | "moyen" | "long">("moyen");
  // Mots-clés / ambiance libres facultatifs pour orienter la génération.
  const [aiKeywords, setAiKeywords] = useState("");
  // Loading dédié au bouton IA (indépendant des boutons submit).
  const [aiPending, setAiPending] = useState(false);
  // 2 états séparés pour pouvoir afficher des libellés différents par bouton
  // sans qu'ils se gênent (les deux désactivés pendant qu'un est actif).
  const [pending, setPending] = useState(false);
  const [pendingRepublish, setPendingRepublish] = useState(false);
  // True quand on est dans un flow "Enregistrer & re-publier" — pilote le
  // libellé "Enregistrement…" / "Re-publication…" pendant l'opération.
  const isAnyPending = pending || pendingRepublish;

  function set<K extends keyof PropertyFormState>(
    key: K,
    value: PropertyFormState[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Construit le payload à envoyer à la mutation Convex à partir du form state.
  // Centralisé ici car create/update prennent les mêmes types de champs
  // (update via le sous-objet `patch`).
  function buildPayload() {
    const features = form.featuresText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      title: form.title,
      description: form.description,
      type: form.type,
      listingType: form.listingType,
      price: Number(form.price),
      // Modalités de paiement — vente uniquement. Valeurs EXPLICITES
      // (false / "") et non undefined : un champ undefined est retiré du
      // payload à la sérialisation Convex, donc en mode édition décocher une
      // case ne supprimerait jamais l'ancienne valeur via `patch`.
      // Le texte n'est persisté que si sa case est cochée (pas d'orphelin).
      acceptsInstallments:
        form.listingType === "sale" && form.acceptsInstallments,
      installmentDetails:
        form.listingType === "sale" && form.acceptsInstallments
          ? form.installmentDetails.trim()
          : "",
      acceptsExchange: form.listingType === "sale" && form.acceptsExchange,
      exchangeDetails:
        form.listingType === "sale" && form.acceptsExchange
          ? form.exchangeDetails.trim()
          : "",
      surface: Number(form.surface),
      rooms: form.rooms ? Number(form.rooms) : undefined,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
      yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : undefined,
      energyClass: form.energyClass || undefined,
      address: form.address,
      city: form.city,
      postalCode: form.postalCode || undefined,
      region: form.region || undefined,
      country: form.country,
      lat: form.lat ? Number(form.lat) : undefined,
      lng: form.lng ? Number(form.lng) : undefined,
      images: form.images,
      videos: form.videos.length > 0 ? form.videos : undefined,
      features,
      // Choix réseaux sociaux — envoyé au backend qui le persiste dans
      // properties.socialMediaChoice. preparePost (convex/social.ts) le lit
      // pour brancher entre carrousel images / post vidéo Zernio.
      socialMediaChoice: form.socialMediaChoice,
    };
  }

  /**
   * Génération IA du titre + description via DeepSeek (action convex/ai.ts).
   *
   * Lit les champs déjà saisis dans le formulaire, les envoie au backend avec
   * les options de style (ton/longueur/mots-clés), puis remplit `title` et
   * `description` dans le state. L'utilisateur peut éditer librement après coup.
   *
   * Garde-fous :
   *   - Exige les champs minimaux (type, prix, surface, ville) pour éviter de
   *     générer une annonce vide de sens (et de gaspiller du quota DeepSeek).
   *   - Le rate-limit réel est appliqué côté serveur (table aiUsage), donc
   *     recliquer "Régénérer" est sûr.
   */
  async function handleGenerate() {
    // Garde-fou client : on a besoin du minimum vital pour un prompt utile.
    if (!form.type || !form.price || !form.surface || !form.city.trim()) {
      toast.error("Renseigne au moins le type, le prix, la surface et la ville.");
      return;
    }
    setAiPending(true);
    try {
      // Conversion des champs string du form → types attendus par l'action.
      // `featuresText` (CSV) → tableau, comme dans buildPayload().
      const features = form.featuresText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await generate({
        type: form.type,
        listingType: form.listingType,
        price: Number(form.price),
        surface: Number(form.surface),
        rooms: form.rooms ? Number(form.rooms) : undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
        city: form.city,
        region: form.region || undefined,
        features,
        keywords: aiKeywords.trim() || undefined,
        tone: aiTone,
        length: aiLength,
      });
      // Remplit les champs — l'utilisateur garde la main pour ajuster.
      set("title", res.title);
      set("description", res.description);
      toast.success("Annonce générée — relis et ajuste si besoin ✨");
    } catch (err: any) {
      toast.error(err?.message ?? "La génération IA a échoué.");
    } finally {
      setAiPending(false);
    }
  }

  /**
   * Submit du formulaire.
   *
   * @param e         Event du form (preventDefault pour bloquer le full reload).
   * @param opts.republishAfter Si true ET mode="edit" : après l'update DB,
   *                  on déclenche une re-publication sur tous les réseaux
   *                  connectés via l'action `republishToSocials`. Utilisé par
   *                  le bouton secondaire "Enregistrer & re-publier".
   */
  async function handleSubmit(
    e: React.FormEvent,
    opts?: { republishAfter?: boolean }
  ) {
    e.preventDefault();
    // Choix du flag pending selon le bouton cliqué — permet d'afficher le bon
    // libellé "Enregistrement…" vs "Re-publication…" sans clash.
    const setBtnPending = opts?.republishAfter
      ? setPendingRepublish
      : setPending;
    setBtnPending(true);
    try {
      // Garde-fou client commun : au moins 1 photo
      if (form.images.length === 0) {
        toast.error("Ajoute au moins une photo.");
        setBtnPending(false);
        return;
      }
      const payload = buildPayload();

      if (mode === "create") {
        const id = await create(payload);
        toast.success("Annonce créée en brouillon");
        void navigate({ to: "/properties/$id", params: { id } });
        return;
      }

      // ----- mode "edit" -----
      if (!propertyId) {
        throw new Error("ID de propriété manquant en mode édition.");
      }
      // Cast `any` requis : le schéma `update` Convex utilise
      // `Object.fromEntries(...)` pour ses champs patch, ce qui efface
      // l'inférence de type côté TS (le patch est vu comme `{status?}`
      // uniquement). Le serveur valide tous les champs au runtime via
      // les validators `v.optional(...)` réels.
      await update({ id: propertyId, patch: payload as any });

      // Si l'utilisateur a cliqué "Enregistrer & re-publier" → on déclenche
      // la re-publication. Sinon, simple toast + redirection.
      if (opts?.republishAfter) {
        try {
          const r = await republish({ propertyId });
          if ("error" in r) {
            // L'update a réussi mais la re-publication a échoué — on informe
            // mais on ne bloque pas la redirection (les modifs sont sauvées).
            toast.error(`Modifs enregistrées, mais re-publication : ${r.error}`);
          } else {
            toast.success(
              `Annonce mise à jour + re-publiée sur ${r.platforms.join(", ")} — résultat dans ~15 s`
            );
          }
        } catch (err: any) {
          toast.error(
            `Modifs enregistrées, mais re-publication a planté : ${err?.message ?? err}`
          );
        }
      } else {
        toast.success("Annonce mise à jour");
      }
      void navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement");
    } finally {
      setBtnPending(false);
    }
  }

  // Libellé du bouton submit (paramétrable via prop, défauts contextuels).
  const buttonLabel =
    submitLabel ??
    (mode === "create" ? "Créer l'annonce" : "Enregistrer les modifications");
  const pendingLabel = mode === "create" ? "Création…" : "Enregistrement…";

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow-soft"
    >
      {/* -------------------------------------------------------------------
          Assistant IA — génère titre + description à partir des champs saisis.
          Pratique pour les propriétaires "en panne d'inspiration".
          Visible en création ET édition (le bouton vit dans ce form partagé).
          La génération ne fait que PRÉ-REMPLIR les champs ci-dessous : tout
          reste éditable, et la sauvegarde passe par le flux habituel.
      ------------------------------------------------------------------- */}
      <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
          <h3 className="text-sm font-semibold text-brand-800">
            Générer avec l'IA
          </h3>
        </div>
        <p className="mb-3 text-xs text-brand-700/70">
          Remplis au moins le type, le prix, la surface et la ville, puis laisse
          l'IA rédiger un titre et une description professionnels. Tu pourras
          tout ajuster ensuite.
        </p>
        <Row cols={2}>
          <LabeledSelect
            label="Ton"
            value={aiTone}
            onChange={(v) => setAiTone(v as any)}
            options={[
              ["professionnel", "Professionnel"],
              ["chaleureux", "Chaleureux"],
              ["luxe", "Luxe / haut de gamme"],
              ["investisseur", "Investisseur"],
            ]}
          />
          <LabeledSelect
            label="Longueur"
            value={aiLength}
            onChange={(v) => setAiLength(v as any)}
            options={[
              ["court", "Court"],
              ["moyen", "Moyen"],
              ["long", "Long"],
            ]}
          />
        </Row>
        <div className="mt-3">
          <Input
            label="Mots-clés / ambiance (optionnel)"
            value={aiKeywords}
            onChange={setAiKeywords}
            placeholder="ex : calme, proche écoles, vue dégagée"
          />
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={aiPending || isAnyPending}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {aiPending
            ? "Génération…"
            : form.title || form.description
              ? "Régénérer"
              : "Générer avec l'IA"}
        </button>
      </div>

      <Row>
        <Input
          label="Titre"
          value={form.title}
          onChange={(v) => set("title", v)}
          required
        />
      </Row>
      <Row>
        <Textarea
          label="Description"
          value={form.description}
          onChange={(v) => set("description", v)}
          rows={5}
          required
          // Compteur de caractères + avertissement de troncature sur les
          // publications réseaux sociaux. La saisie reste libre (pas de
          // maxLength) car la description complète est conservée sur la page
          // détail Osy-Immo. Au-delà du seuil, on signale juste à l'auteur
          // que les visiteurs FB/IG verront une version tronquée.
          // Voir convex/social.ts:buildCaption pour la troncature côté backend.
          helper={
            <DescriptionCounter length={form.description.length} />
          }
        />
      </Row>

      <Row cols={3}>
        <LabeledSelect
          label="Type de bien"
          value={form.type}
          onChange={(v) => set("type", v as any)}
          options={[
            ["apartment", "Appartement"],
            ["house", "Maison"],
            ["land", "Terrain"],
            ["commercial", "Commercial"],
          ]}
        />
        <LabeledSelect
          label="Transaction"
          value={form.listingType}
          onChange={(v) => set("listingType", v as any)}
          options={[
            ["sale", "Vente"],
            ["rent", "Location"],
          ]}
        />
        <Input
          label="Prix (FCFA)"
          type="number"
          value={form.price}
          onChange={(v) => set("price", v)}
          required
        />
      </Row>

      {/* -----------------------------------------------------------------
          Modalités de paiement flexibles — vente uniquement (les tranches /
          l'échange n'ont pas de sens pour un loyer mensuel). Chaque case
          cochée révèle un textarea optionnel décrivant les conditions.
          Persisté dans properties.acceptsInstallments / installmentDetails /
          acceptsExchange / exchangeDetails (cf. convex/schema.ts).
          ----------------------------------------------------------------- */}
      {form.listingType === "sale" && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-brand-700/70">
            Modalités de paiement acceptées
          </p>
          <div className="flex flex-col gap-3">
            <PaymentModeField
              label="Paiement en tranches accepté"
              checked={form.acceptsInstallments}
              onCheckedChange={(c) => set("acceptsInstallments", c)}
              detailsLabel="Conditions (optionnel)"
              detailsPlaceholder="Ex : 40% à la signature, solde sur 12 mois"
              details={form.installmentDetails}
              onDetailsChange={(v) => set("installmentDetails", v)}
            />
            <PaymentModeField
              label="Échange / troc accepté"
              checked={form.acceptsExchange}
              onCheckedChange={(c) => set("acceptsExchange", c)}
              detailsLabel="Ce que vous acceptez en échange (optionnel)"
              detailsPlaceholder="Ex : voiture récente, autre terrain, échange partiel + complément en argent…"
              details={form.exchangeDetails}
              onDetailsChange={(v) => set("exchangeDetails", v)}
            />
          </div>
        </div>
      )}

      <Row cols={3}>
        <Input
          label="Surface (m²)"
          type="number"
          value={form.surface}
          onChange={(v) => set("surface", v)}
          required
        />
        <Input
          label="Pièces"
          type="number"
          value={form.rooms}
          onChange={(v) => set("rooms", v)}
        />
        <Input
          label="Chambres"
          type="number"
          value={form.bedrooms}
          onChange={(v) => set("bedrooms", v)}
        />
      </Row>

      <Row cols={3}>
        <Input
          label="Salles de bain"
          type="number"
          value={form.bathrooms}
          onChange={(v) => set("bathrooms", v)}
        />
        <Input
          label="Année de construction"
          type="number"
          value={form.yearBuilt}
          onChange={(v) => set("yearBuilt", v)}
        />
        <Input
          label="Classe énergie (A-G)"
          value={form.energyClass}
          onChange={(v) => set("energyClass", v)}
        />
      </Row>

      <Row>
        <Input
          label="Adresse (quartier, rue, lieu-dit)"
          value={form.address}
          onChange={(v) => set("address", v)}
          required
          placeholder="Bonapriso, derrière le rond-point Deido"
        />
      </Row>

      <Row cols={2}>
        <Input
          label="Ville"
          value={form.city}
          onChange={(v) => set("city", v)}
          required
          placeholder="Douala, Yaoundé, Bafoussam…"
        />
        <LabeledSelect
          label="Région"
          value={form.region}
          onChange={(v) => set("region", v)}
          options={CAMEROON_REGIONS.map((r) => [r, r] as [string, string])}
        />
      </Row>

      <Row cols={2}>
        <Input
          label="Pays"
          value={form.country}
          onChange={(v) => set("country", v)}
          required
        />
        <Input
          label="Code postal (optionnel)"
          value={form.postalCode}
          onChange={(v) => set("postalCode", v)}
          placeholder="ex : BP 1234"
        />
      </Row>

      {/* Coordonnées GPS optionnelles — pour la carte sur la page détail */}
      <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-brand-700">
            Coordonnées GPS{" "}
            <span className="text-brand-700/60">(optionnel)</span>
          </p>
          <button
            type="button"
            onClick={async () => {
              if (!navigator.geolocation) {
                toast.error("Géolocalisation non supportée par ce navigateur.");
                return;
              }
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  set("lat", pos.coords.latitude.toFixed(6));
                  set("lng", pos.coords.longitude.toFixed(6));
                  toast.success("Position détectée");
                },
                () => toast.error("Impossible d'obtenir votre position."),
                { enableHighAccuracy: true, timeout: 10000 }
              );
            }}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-700 shadow-soft hover:bg-brand-100"
          >
            📍 Utiliser ma position
          </button>
        </div>
        <Row cols={2}>
          <Input
            label="Latitude"
            type="number"
            value={form.lat}
            onChange={(v) => set("lat", v)}
            placeholder="ex : 4.0511 (Yaoundé)"
          />
          <Input
            label="Longitude"
            type="number"
            value={form.lng}
            onChange={(v) => set("lng", v)}
            placeholder="ex : 9.7679 (Douala)"
          />
        </Row>
        <p className="mt-2 text-xs text-brand-700/60">
          Si renseignées, une carte sera affichée sur la page de l'annonce.
        </p>
      </div>

      {/* Médias --------------------------------------------------- */}
      <Row>
        <MediaUploader
          kind="image"
          value={form.images}
          onChange={(v) => set("images", v)}
        />
      </Row>
      <Row>
        <MediaUploader
          kind="video"
          value={form.videos}
          onChange={(v) => set("videos", v)}
        />
      </Row>

      <Row>
        <Input
          label="Équipements (séparés par des virgules)"
          value={form.featuresText}
          onChange={(v) => set("featuresText", v)}
          placeholder="balcon, parking, ascenseur"
        />
      </Row>

      {/* Choix du média publié sur les réseaux sociaux (FB + IG + TikTok via Zernio).
          - "images" : carrousel des photos (comportement historique, défaut)
          - "video"  : la vidéo principale (videos[0]) en post vidéo natif
          L'option "vidéo" est désactivée tant qu'aucune vidéo n'est uploadée
          (pour éviter de cocher un choix qui retomberait silencieusement sur
          les images côté backend). */}
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
          Publication sur les réseaux sociaux
        </label>
        <div className="space-y-2 rounded-lg border border-brand-200 bg-white p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="socialMediaChoice"
              value="images"
              checked={form.socialMediaChoice === "images"}
              onChange={() => set("socialMediaChoice", "images")}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium text-brand-900">
                Publier les photos en carrousel
              </span>
              {form.images.length > 0 && (
                <span className="ml-1 text-brand-700/60">
                  ({form.images.length} photo{form.images.length > 1 ? "s" : ""})
                </span>
              )}
              <span className="block text-xs text-brand-700/60">
                Toutes les images uploadées, l'image principale en première.
              </span>
            </span>
          </label>
          <label
            className={cn(
              "flex items-start gap-2",
              form.videos.length === 0
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer"
            )}
          >
            <input
              type="radio"
              name="socialMediaChoice"
              value="video"
              checked={form.socialMediaChoice === "video"}
              onChange={() => set("socialMediaChoice", "video")}
              disabled={form.videos.length === 0}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium text-brand-900">
                Publier la vidéo principale
              </span>
              {form.videos.length > 0 ? (
                <span className="ml-1 text-brand-700/60">
                  ({form.videos.length} vidéo
                  {form.videos.length > 1 ? "s" : ""} uploadée
                  {form.videos.length > 1 ? "s" : ""})
                </span>
              ) : (
                <span className="ml-1 text-brand-700/60">
                  — uploadez d'abord une vidéo
                </span>
              )}
              <span className="block text-xs text-brand-700/60">
                Format Reels TikTok / Instagram + post vidéo Facebook.
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* CTA principal : Enregistrer (ou Créer) — toujours visible.
          En mode "edit" + annonce déjà active, on ajoute juste en dessous
          un second bouton qui repost sur les réseaux après la sauvegarde. */}
      <button
        type="submit"
        disabled={isAnyPending}
        className="w-full rounded-xl bg-accent-500 px-4 py-3 text-sm font-medium text-white hover:bg-accent-600 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
      >
        {pending ? pendingLabel : buttonLabel}
      </button>

      {/* Bouton secondaire "Enregistrer & re-publier" :
          - Visible UNIQUEMENT en mode "edit" sur une annonce déjà active
            (les brouillons et annonces vendues/archivées n'ont pas vocation
            à être re-publiées sur les réseaux).
          - Style "outline" pour ne pas concurrencer le CTA principal :
            l'utilisateur normal sauvegarde sans re-poster ; ce bouton est
            une action explicite "et notifie mes followers de la modif".
          - Appelle handleSubmit avec opts.republishAfter=true qui chaîne
            update DB → republishToSocials (FB + IG + TikTok connectés). */}
      {mode === "edit" && currentStatus === "active" && (
        <button
          type="button"
          onClick={(e) => handleSubmit(e, { republishAfter: true })}
          disabled={isAnyPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm font-medium text-brand-700 hover:bg-brand-50 active:scale-[0.97] transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-swift-out)] disabled:opacity-60"
        >
          <Share2 className="h-4 w-4" />
          {pendingRepublish
            ? "Re-publication…"
            : "Enregistrer & re-publier sur les réseaux"}
        </button>
      )}
    </form>
  );
}

// ----------------------------- helpers UI -----------------------------

// IMPORTANT : Tailwind ne scanne QUE les classes présentes en clair dans le code source.
// Les classes construites dynamiquement (`sm:grid-cols-${cols}`) ne sont jamais émises
// dans la feuille de styles → on map explicitement chaque valeur de `cols`.
function Row({
  children,
  cols = 1,
}: {
  children: React.ReactNode;
  cols?: 1 | 2 | 3;
}) {
  const colClass =
    cols === 3
      ? "sm:grid-cols-3"
      : cols === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-1";
  return (
    <div className={`grid grid-cols-1 gap-3 ${colClass}`}>{children}</div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
        {label}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows = 3,
  required,
  placeholder,
  helper,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  required?: boolean;
  placeholder?: string;
  // Noeud optionnel rendu sous le <textarea> (compteur de caractères,
  // texte d'aide, etc.). La logique de calcul reste côté caller pour
  // garder ce composant générique.
  helper?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
        {label}
      </label>
      <textarea
        value={value}
        required={required}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {helper}
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// PaymentModeField : case à cocher d'une modalité de paiement (tranches ou
// échange) + textarea de détails révélé uniquement quand la case est cochée.
//
// Rôle : composant contrôlé — l'état vit dans PropertyFormState (parent).
// Interactions : utilisé 2× dans la section « Modalités de paiement » du form
// (vente uniquement). maxLength 300 = PAYMENT_DETAILS_MAX côté serveur
// (convex/properties.ts) — la borne UI évite l'erreur serveur au submit.
//
// Exemple : <PaymentModeField label="Paiement en tranches accepté"
//             checked={form.acceptsInstallments} ... />
// -------------------------------------------------------------------------------------------------
function PaymentModeField({
  label,
  checked,
  onCheckedChange,
  detailsLabel,
  detailsPlaceholder,
  details,
  onDetailsChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  detailsLabel: string;
  detailsPlaceholder: string;
  details: string;
  onDetailsChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-900">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="h-4 w-4 rounded border-brand-300 text-accent-500 focus:ring-accent-500"
        />
        {label}
      </label>
      {checked && (
        <div className="mt-2 pl-6">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
            {detailsLabel}
          </label>
          <textarea
            value={details}
            rows={2}
            maxLength={300}
            placeholder={detailsPlaceholder}
            onChange={(e) => onDetailsChange(e.target.value)}
            className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// DescriptionCounter : affiche en temps réel le nombre de caractères saisis
// dans la description + un avertissement quand on dépasse la limite réseaux.
//
// Trois paliers visuels pour ne pas alarmer prématurément :
//   - 0 à 75 %    de la limite → gris discret, juste informatif
//   - 75 à 100 % de la limite → ambre, on approche
//   - > 100 %    de la limite → rouge + message complet de troncature
//
// La limite SOCIAL_CAPTION_DESCRIPTION_MAX (400) est définie dans
// src/lib/social-limits.ts et reflète la troncature appliquée côté Convex
// dans convex/social.ts:buildCaption.
// -------------------------------------------------------------------------------------------------
function DescriptionCounter({ length }: { length: number }) {
  const limit = SOCIAL_CAPTION_DESCRIPTION_MAX;
  const isOver = length > limit;
  // Seuil de transition vers la couleur ambre : 75 % de la limite.
  // Choix calibré pour donner le temps de réagir avant de basculer en rouge.
  const isNear = !isOver && length > limit * 0.75;

  return (
    <p
      className={cn(
        "mt-1 text-xs",
        isOver
          ? "font-medium text-red-600"
          : isNear
            ? "text-amber-600"
            : "text-brand-700/50"
      )}
    >
      {isOver ? (
        <>
          {length} caractères — sera tronqué à {limit} dans les publications
          Facebook, Instagram et TikTok
        </>
      ) : (
        <>
          {length} / {limit} caractères
        </>
      )}
    </p>
  );
}

/**
 * Wrapper local : ajoute un label uppercase au-dessus du composant Select
 * partagé. Conserve la signature `options: [value, label][]` pour rester
 * compatible avec les usages historiques.
 */
function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70">
        {label}
      </label>
      <Select
        value={value}
        onChange={onChange}
        options={options.map(([v, l]) => ({ value: v, label: l }))}
        ariaLabel={label}
      />
    </div>
  );
}
