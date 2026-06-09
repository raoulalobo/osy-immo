// src/components/Prose.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Wrapper de typographie pour les articles de blog.
//
//        Comme on n'utilise PAS `@tailwindcss/typography` (zéro dépendance ajoutée),
//        on définit ici des styles arbitraires Tailwind ciblés sur les balises HTML
//        rendues par les composants articles dans `src/content/blog/<slug>.tsx`.
//
//        Avantage : chaque article reste pur HTML/JSX (paragraphes, h2, ul, etc.),
//        sans avoir à se soucier des classes Tailwind dans le contenu.
//
// Sélecteurs arbitraires utilisés :
//   - `[&>h2]:…`  s'applique aux <h2> directement enfants du Prose
//   - `[&_p]:…`   s'applique aux <p> à n'importe quelle profondeur (utile pour
//                 les paragraphes dans <li>, <blockquote>, etc.)
//
// Exemple d'usage :
//   <Prose>
//     <p>Au Cameroun, le titre foncier...</p>
//     <h2>Étapes</h2>
//     <ol><li>...</li></ol>
//   </Prose>
// -------------------------------------------------------------------------------------------------

import type { ReactNode } from "react";

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        // Largeur lecture confortable (≈ 70 caractères/ligne en taille base)
        "max-w-2xl text-brand-900",
        // Titres
        "[&>h2]:mt-10 [&>h2]:mb-3 [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:tracking-tight [&>h2]:text-brand-700",
        "[&>h3]:mt-6 [&>h3]:mb-2 [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:text-brand-700",
        // Paragraphes
        "[&>p]:mb-4 [&>p]:leading-7 [&>p]:text-base [&>p]:text-brand-900/90",
        // Listes
        "[&>ul]:my-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-1",
        "[&>ol]:my-4 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:space-y-1",
        "[&_li]:leading-7 [&_li]:text-brand-900/90",
        // Liens
        "[&_a]:font-medium [&_a]:text-accent-500 [&_a:hover]:underline",
        // Citations (textes de loi, références)
        "[&>blockquote]:my-6 [&>blockquote]:border-l-4 [&>blockquote]:border-accent-500 [&>blockquote]:bg-brand-50 [&>blockquote]:px-4 [&>blockquote]:py-3 [&>blockquote]:text-sm [&>blockquote]:italic [&>blockquote]:text-brand-700",
        // Code inline (pour citer ordonnances, articles de loi)
        "[&_code]:rounded [&_code]:bg-brand-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:font-mono [&_code]:text-brand-700",
        // En gras + souligné sémantiques
        "[&_strong]:font-semibold [&_strong]:text-brand-700",
        // Séparateurs
        "[&>hr]:my-8 [&>hr]:border-brand-200",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
