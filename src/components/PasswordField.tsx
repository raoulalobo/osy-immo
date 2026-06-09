// src/components/PasswordField.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Champ mot de passe réutilisable avec toggle "œil" pour afficher/masquer la saisie.
//        Le toggle est purement local (state interne) — ne remonte rien au parent.
//
// Props :
//  - label    : label affiché au-dessus du champ
//  - value    : valeur contrôlée
//  - onChange : callback (string)
//  - required : passe l'attribut HTML required
//  - autoComplete : "current-password" pour login, "new-password" pour register
//  - id       : optionnel — utile quand on a plusieurs champs sur la même page
//                (sinon `useId()` génère un id unique pour lier label/input)
//
// Accessibilité :
//  - Le bouton toggle a un `aria-label` qui change selon l'état.
//  - `aria-pressed` indique l'état actif du toggle.
//  - `tabIndex={-1}` sur le bouton : on ne veut pas casser le flow Tab clavier
//    qui doit aller du champ mot de passe au bouton submit suivant.
//
// Exemple :
//   <PasswordField
//     label="Mot de passe"
//     value={password}
//     onChange={setPassword}
//     required
//     autoComplete="current-password"
//   />
// -------------------------------------------------------------------------------------------------

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: "current-password" | "new-password" | "off";
  id?: string;
  placeholder?: string;
}

export function PasswordField({
  label,
  value,
  onChange,
  required,
  autoComplete = "current-password",
  id,
  placeholder,
}: PasswordFieldProps) {
  // Génère un id stable si non fourni — sécurise l'association label ↔ input
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-700/70"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          // pr-10 : laisse la place pour le bouton œil (40px ≈ taille du h-9 w-9)
          className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-brand-700/60 hover:text-brand-700"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
