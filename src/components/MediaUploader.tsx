// src/components/MediaUploader.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Composant d'upload de médias (images ou vidéos) vers Convex Storage.
//        - Drag & drop OU sélection via input file.
//        - Limite configurable (max N fichiers, taille max par fichier).
//        - Affiche un aperçu pour chaque fichier (thumbnail image / preview vidéo).
//        - Possibilité de réordonner / supprimer un élément.
//
// Props :
//  - kind          : "image" | "video" — détermine le `accept`, la limite par défaut et le rendu.
//  - max           : nombre maxi de fichiers (10 pour image, 5 pour video par défaut).
//  - value         : liste actuelle des URLs (stockées dans le form parent).
//  - onChange      : appelé à chaque ajout/suppression.
//  - maxSizeMB     : taille max par fichier (10 Mo image, 100 Mo vidéo par défaut).
//
// Workflow technique :
//  1. `generateUploadUrl` (mutation Convex) → URL signée.
//  2. fetch POST direct (body = File) → { storageId }.
//  3. `getUrl({ storageId })` (query Convex) → URL CDN stable.
//  4. push dans `value` via `onChange`.
//
// Exemple :
//   <MediaUploader kind="image" max={10} value={images} onChange={setImages} />
// -------------------------------------------------------------------------------------------------

import { useConvex, useMutation } from "convex/react";
import { AlertTriangle, ImagePlus, Loader2, Star, Trash2, Video } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cn } from "~/lib/utils";

type Kind = "image" | "video";

interface MediaUploaderProps {
  kind: Kind;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;       // défaut : 10 (image) / 5 (video)
  maxSizeMB?: number; // défaut : 10 Mo (image) / 100 Mo (video)
  label?: string;
}

const DEFAULTS: Record<Kind, { max: number; maxSizeMB: number; accept: string }> = {
  image: { max: 10, maxSizeMB: 10, accept: "image/*" },
  video: { max: 5, maxSizeMB: 100, accept: "video/*" },
};

// ------------------------------------------------------------------------------------------------
// Limites connues des plateformes sociales (mai 2026) — utilisées pour générer les
// avertissements non-bloquants côté client. Centralisées ici pour un seul endroit à mettre à jour
// si les plateformes changent leurs règles (TikTok est passé de 60s → 3min → 10min selon le compte).
//
// Note : on n'utilise PAS ces limites pour bloquer l'upload ni la publication. Elles servent
// uniquement à informer l'utilisateur AVANT que Zernio ne fasse l'appel plateforme (qui prendrait
// ~30 s et échouerait silencieusement jusqu'au prochain reconcile).
// ------------------------------------------------------------------------------------------------
const PLATFORM_VIDEO_LIMITS = {
  /** Instagram Reels — coupe à 90 s, ratio 9:16 recommandé. */
  IG_REELS_MAX_S: 90,
  /** TikTok compte non vérifié — max 60 s. Comptes vérifiés/business : jusqu'à 10 min. */
  TIKTOK_BASIC_MAX_S: 60,
  /** Ratio largeur/hauteur — au-dessus de 1.0 c'est du paysage, mal rendu en Reels/TikTok. */
  PORTRAIT_RATIO_MAX: 1.0,
} as const;

/**
 * Lit les metadata d'une URL vidéo (durée + ratio) via un élément `<video>` off-screen.
 *
 * Aucune dépendance externe, aucun appel serveur — utilise simplement l'API HTML Media
 * du navigateur. Le `preload="metadata"` fait télécharger uniquement l'en-tête du fichier
 * (typiquement <1 Mo) suffisant pour récupérer durée et dimensions.
 *
 * Rejette si la vidéo est illisible (corruption, codec non supporté par le navigateur).
 * Dans ce cas, l'appelant doit ignorer l'erreur — on n'empêche pas l'upload puisque Zernio
 * ou la plateforme finale capturera l'erreur si besoin.
 *
 * Exemple :
 *   const { duration, ratio } = await probeVideo("https://cdn.../video.mp4");
 *   // duration = 45 (secondes), ratio = 0.5625 (= 9:16)
 */
const probeVideo = (url: string): Promise<{ duration: number; ratio: number }> =>
  new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () =>
      resolve({
        duration: v.duration,
        // Garde-fou : si videoHeight est 0 (rare mais possible sur certains codecs exotiques),
        // on évite la division par zéro en clampant à 1.
        ratio: v.videoWidth / Math.max(v.videoHeight, 1),
      });
    v.onerror = () => reject(new Error("Metadata vidéo illisible"));
    v.src = url;
  });

/**
 * Calcule les avertissements de compatibilité plateformes pour une vidéo donnée.
 *
 * Retourne un tableau (potentiellement vide) de phrases courtes à afficher dans un toast
 * et/ou un tooltip sur la vignette. L'ordre est : Instagram → TikTok → ratio (du plus impactant
 * au moins impactant).
 *
 * Exemple :
 *   computeVideoWarnings({ duration: 120, ratio: 1.78 })
 *   // → ["Instagram Reels coupe à 90 s",
 *   //    "TikTok (compte non vérifié) limite à 60 s",
 *   //    "Format paysage — recommandé 9:16 pour Reels/TikTok"]
 */
const computeVideoWarnings = (meta: { duration: number; ratio: number }): string[] => {
  const warnings: string[] = [];
  if (meta.duration > PLATFORM_VIDEO_LIMITS.IG_REELS_MAX_S) {
    warnings.push(`Instagram Reels coupe à ${PLATFORM_VIDEO_LIMITS.IG_REELS_MAX_S} s`);
  }
  if (meta.duration > PLATFORM_VIDEO_LIMITS.TIKTOK_BASIC_MAX_S) {
    warnings.push(
      `TikTok (compte non vérifié) limite à ${PLATFORM_VIDEO_LIMITS.TIKTOK_BASIC_MAX_S} s`
    );
  }
  if (meta.ratio > PLATFORM_VIDEO_LIMITS.PORTRAIT_RATIO_MAX) {
    warnings.push("Format paysage — recommandé 9:16 pour Reels/TikTok");
  }
  return warnings;
};

export function MediaUploader({
  kind,
  value,
  onChange,
  max,
  maxSizeMB,
  label,
}: MediaUploaderProps) {
  const cfg = DEFAULTS[kind];
  const maxFiles = max ?? cfg.max;
  const maxSize = (maxSizeMB ?? cfg.maxSizeMB) * 1024 * 1024;

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  // Accès direct au client Convex pour invoquer une query one-shot (sans subscription).
  // Plus propre que `useQuery` ici car on n'a pas besoin de réactivité sur l'URL.
  const convex = useConvex();

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Avertissements de compatibilité plateformes par URL vidéo.
  // Clé = URL CDN, valeur = liste de phrases courtes (ex: "Instagram Reels coupe à 90 s").
  // Affichés dans un badge ⚠️ orange en haut-droite de la vignette (au hover : tooltip
  // listant tous les warnings). Persisté en state local — pas en DB — car le calcul est
  // déterministe et rapide depuis la durée+ratio (qu'on pourrait re-prober au remount,
  // mais on évite des re-fetch inutiles tant que le composant est monté).
  const [videoWarnings, setVideoWarnings] = useState<Record<string, string[]>>({});

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const incoming = Array.from(files);
      if (incoming.length === 0) return;

      // Garde-fou : ne pas dépasser le quota
      const remaining = maxFiles - value.length;
      if (remaining <= 0) {
        toast.error(`Limite atteinte (${maxFiles} fichiers max)`);
        return;
      }
      const toUpload = incoming.slice(0, remaining);
      if (incoming.length > remaining) {
        toast.warning(
          `Seuls les ${remaining} premier(s) fichier(s) sur ${incoming.length} ont été retenus.`
        );
      }

      // Filtre par type MIME et taille
      const valid = toUpload.filter((f) => {
        if (!f.type.startsWith(kind === "image" ? "image/" : "video/")) {
          toast.error(`"${f.name}" n'est pas un fichier ${kind === "image" ? "image" : "vidéo"}.`);
          return false;
        }
        if (f.size > maxSize) {
          toast.error(`"${f.name}" dépasse la taille max (${maxSizeMB ?? cfg.maxSizeMB} Mo).`);
          return false;
        }
        return true;
      });
      if (valid.length === 0) return;

      setUploading(true);
      try {
        // Upload séquentiel pour éviter de saturer (parallel possible si besoin)
        const newUrls: string[] = [];
        for (const file of valid) {
          // 1) URL signée
          const postUrl = await generateUploadUrl({});
          // 2) Upload binaire
          const res = await fetch(postUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!res.ok) {
            throw new Error(`Upload échoué pour "${file.name}" (${res.status})`);
          }
          const { storageId } = (await res.json()) as { storageId: string };

          // 3) Résolution en URL CDN stable via la query `files.getUrl`.
          //    On utilise `convex.query(...)` (one-shot, sans subscription) plutôt
          //    qu'un `useQuery` puisqu'on s'en sert juste après l'upload.
          const url = await convex.query(api.files.getUrl, {
            storageId: storageId as Id<"_storage">,
          });
          if (!url) {
            throw new Error(`Impossible de récupérer l'URL pour "${file.name}"`);
          }
          newUrls.push(url);

          // 4) Pour les vidéos uniquement : probe les metadata (durée + ratio) pour
          //    générer des avertissements de compatibilité plateformes (IG Reels >90s,
          //    TikTok perso >60s, format paysage). Affichage immédiat via toast + badge
          //    ⚠️ persistant sur la vignette (state videoWarnings).
          //
          //    Pas de blocage : l'utilisateur peut quand même publier — TikTok élargit
          //    régulièrement ses limites selon le statut du compte, et on préfère un
          //    faux positif (warning sur vidéo finalement acceptée) à un faux négatif
          //    (blocage sur vidéo valide).
          //
          //    Si probeVideo rejette (codec exotique, fichier corrompu), on ignore
          //    silencieusement — Zernio ou la plateforme finale capturera l'erreur.
          if (kind === "video") {
            try {
              const meta = await probeVideo(url);
              const warnings = computeVideoWarnings(meta);
              if (warnings.length > 0) {
                // Stocke pour le badge ⚠️ persistant (clé = URL).
                setVideoWarnings((prev) => ({ ...prev, [url]: warnings }));
                // Toast immédiat — 8s de durée pour laisser le temps de lire la liste.
                toast.warning(
                  `"${file.name}" (${Math.round(meta.duration)} s) : ${warnings.join(" · ")}`,
                  { duration: 8000 }
                );
              }
            } catch {
              // Metadata illisible : silencieux, l'upload reste valide.
            }
          }
        }
        onChange([...value, ...newUrls]);
        toast.success(
          newUrls.length > 1
            ? `${newUrls.length} fichiers uploadés`
            : "Fichier uploadé"
        );
      } catch (err: any) {
        toast.error(err?.message ?? "Erreur lors de l'upload");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [cfg.maxSizeMB, convex, generateUploadUrl, kind, maxFiles, maxSize, maxSizeMB, onChange, value]
  );

  const remove = (idx: number) => {
    const removedUrl = value[idx];
    onChange(value.filter((_, i) => i !== idx));
    // Nettoie l'entrée correspondante dans videoWarnings (évite d'accumuler des entrées
    // orphelines au fil des suppressions). No-op pour les images puisqu'elles n'écrivent
    // jamais dans cet état.
    if (removedUrl && videoWarnings[removedUrl]) {
      setVideoWarnings((prev) => {
        const next = { ...prev };
        delete next[removedUrl];
        return next;
      });
    }
  };

  /**
   * Promeut l'image à l'index `idx` comme image PRINCIPALE.
   *
   * Convention : la première image du tableau (`images[0]`) est toujours
   * considérée comme l'image principale dans tout le projet :
   *   - PropertyCard l'utilise pour le rendu de carte sur /properties
   *   - properties.$id.tsx l'utilise pour Open Graph og:image (preview FB/WhatsApp)
   *   - Zernio (social.ts) l'inclut en premier dans le carrousel multi-plateformes
   *   - Email Resend l'embed dans le template nouvelle conversation
   *
   * Aucun champ supplémentaire en DB — on réordonne simplement le tableau, et
   * tout le reste s'adapte automatiquement. No-op si idx est déjà 0.
   *
   * Pas applicable aux vidéos (kind="video") — le call-site ne rendra pas
   * le bouton dans ce cas (cf. condition kind === "image" dans le JSX).
   */
  const setAsPrimary = (idx: number) => {
    if (idx === 0 || idx >= value.length) return;
    const next = [...value];
    const [picked] = next.splice(idx, 1);
    if (picked !== undefined) next.unshift(picked);
    onChange(next);
    toast.success("Image principale mise à jour");
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs font-medium uppercase tracking-wide text-brand-700/70">
          {label ??
            (kind === "image"
              ? `Photos (${value.length}/${maxFiles})`
              : `Vidéos (${value.length}/${maxFiles})`)}
        </label>
        {uploading && (
          <span className="inline-flex items-center gap-1 text-xs text-brand-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Upload…
          </span>
        )}
      </div>

      {/* Zone drag & drop ----------------------------------------------- */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
        disabled={value.length >= maxFiles}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-white py-8 text-sm transition",
          dragOver
            ? "border-brand-500 bg-brand-50"
            : "border-brand-200 hover:border-brand-500/60",
          value.length >= maxFiles && "cursor-not-allowed opacity-50"
        )}
      >
        {kind === "image" ? (
          <ImagePlus className="h-6 w-6 text-brand-500" />
        ) : (
          <Video className="h-6 w-6 text-brand-500" />
        )}
        <span className="font-medium text-brand-700">
          {value.length >= maxFiles
            ? "Limite atteinte"
            : `Glissez vos ${kind === "image" ? "images" : "vidéos"} ou cliquez pour parcourir`}
        </span>
        <span className="text-xs text-brand-700/60">
          {kind === "image" ? "JPEG, PNG, WEBP" : "MP4, WEBM, MOV"} · max{" "}
          {maxSizeMB ?? cfg.maxSizeMB} Mo / fichier
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={cfg.accept}
        multiple
        className="hidden"
        onChange={(e) => e.target.files && void upload(e.target.files)}
      />

      {/* Aperçus -------------------------------------------------------- */}
      {value.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {value.map((url, idx) => (
            <li
              key={url + idx}
              className="group relative overflow-hidden rounded-lg border border-brand-200 bg-white"
            >
              {kind === "image" ? (
                <img
                  src={url}
                  alt={`Aperçu ${idx + 1}`}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                // `controls` activé pour permettre play/pause/scrub directement
                // dans la grille — l'utilisateur prévisualise les vidéos avant
                // de choisir laquelle marquer comme principale.
                <video
                  src={url}
                  className="aspect-square w-full object-cover"
                  muted
                  playsInline
                  controls
                  preload="metadata"
                />
              )}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-red-600 opacity-0 shadow transition group-hover:opacity-100"
                aria-label="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              {/* Badge ⚠️ compatibilité plateformes — visible UNIQUEMENT pour les vidéos
                  ayant un ou plusieurs warnings (durée > IG Reels 90s, > TikTok perso 60s,
                  ou format paysage). Toujours visible (pas en opacity-0 comme Trash) car
                  c'est une info critique que l'utilisateur doit voir.
                  Position : à gauche du bouton Trash (right-9), pour ne pas masquer le badge
                  "Principale" en haut-gauche. Tooltip natif (title=) liste tous les warnings. */}
              {kind === "video" && videoWarnings[url] && videoWarnings[url].length > 0 && (
                <span
                  className="absolute right-9 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 shadow"
                  title={videoWarnings[url].join("\n")}
                  aria-label={`Avertissements compatibilité plateformes : ${videoWarnings[url].join(", ")}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
              )}
              {/* Badge "Principale" sur idx=0 — non cliquable, juste indicatif.
                  C'est la convention partagée dans tout le projet :
                  - Pour `kind="image"` : 1ère image = og:image, carrousel
                    Zernio, vignette email, PropertyCard.
                  - Pour `kind="video"` : 1ère vidéo = celle publiée sur les
                    réseaux quand l'utilisateur coche "video" dans le radio
                    socialMediaChoice de PropertyForm. */}
              {idx === 0 && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-accent-500 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
                  <Star className="h-3 w-3 fill-current" />
                  Principale
                </span>
              )}
              {/* Bouton "Définir comme principale" — visible UNIQUEMENT sur
                  les médias non-primaires (idx > 0), pour images ET vidéos.
                  Déplace le média au début du tableau via setAsPrimary(idx).
                  Pattern d'opacité identique au bouton Trash : visible au hover
                  desktop. Sur mobile (no hover) l'utilisateur tape le média
                  → focus → opacité 100 (le tap simule un hover sur mobile Webkit). */}
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => setAsPrimary(idx)}
                  className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-medium text-brand-700 opacity-0 shadow transition hover:bg-accent-500 hover:text-white group-hover:opacity-100"
                  aria-label={`Définir comme ${kind === "image" ? "image" : "vidéo"} principale`}
                  title={`Définir comme ${kind === "image" ? "image" : "vidéo"} principale`}
                >
                  <Star className="h-3 w-3" />
                  Principale
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

