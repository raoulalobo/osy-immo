// src/components/Select.tsx
// -------------------------------------------------------------------------------------------------
// Rôle : Composant Select React custom, alternative aux `<select>` HTML natifs dont
//        la liste déroulante (rendue par l'OS) est non-stylable et casse la charte.
//
//  Pourquoi maison plutôt que Radix/Headless UI ?
//   - Cohérence : reprend exactement les tokens design system existants
//     (--ease-swift-out, --shadow-card-hover, animate-popover-in).
//   - Zéro dépendance ajoutée au bundle.
//   - Le besoin est simple : single-select sans group, sans virtualization,
//     sans portal — Radix serait du surdimensionné.
//
//  Fonctionnalités :
//   - Click souris : toggle trigger, click option pour sélectionner, click extérieur ferme.
//   - Clavier : Space/Enter/ArrowDown ouvre · Arrow up/down navigue · Enter/Space sélectionne ·
//     Escape ferme sans changer · Tab ferme + passe au champ suivant.
//   - ARIA complet : combobox + listbox + activedescendant.
//   - Respect `prefers-reduced-motion` (déjà géré globalement dans styles.css).
//
//  Limites connues :
//   - Pas de multi-select.
//   - Pas de type-ahead par lettre (à ajouter si besoin).
//   - Pas de portal — le popover est `absolute`, peut être coupé par un parent
//     `overflow-hidden` très serré. Pour le cas dashboard.index (tableau), on
//     utilise `position: fixed` pour échapper au tr.
// -------------------------------------------------------------------------------------------------

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "~/lib/utils";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  // Optionnel : icône lucide ou ReactNode rendue à gauche du label
  icon?: ReactNode;
  // Optionnel : texte secondaire à droite (ex: "défaut", "premium", etc.)
  hint?: string;
}

export interface SelectProps<T extends string = string> {
  value: T | "";
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  // "input"  = bouton stylé comme un input de formulaire (par défaut)
  // "ghost"  = pas de bordure visible, hover seulement (utile dans tableaux)
  variant?: "input" | "ghost";
  className?: string;
  ariaLabel?: string;
  // Force le popover à utiliser `position: fixed` au lieu de `absolute`.
  // Pratique quand le parent a un overflow:hidden (cellule de tableau).
  detached?: boolean;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Sélectionner…",
  disabled = false,
  variant = "input",
  className,
  ariaLabel,
  detached = false,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  // Index de l'option focusée au clavier — `-1` = aucune
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Refs pour le trigger (positionnement + focus) et la liste (scroll into view)
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // IDs stables pour ARIA (un par instance)
  const baseId = useId();
  const listId = `${baseId}-list`;

  // Coordonnées calculées si detached=true — sinon undefined (positionnement
  // par défaut = absolute sous le trigger via classes Tailwind).
  const [fixedPos, setFixedPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Récupère l'option actuellement sélectionnée pour afficher son label
  const selectedOption = options.find((o) => o.value === value);

  // ----- Open / Close ------------------------------------------------------
  function toggle() {
    if (disabled) return;
    setOpen((o) => {
      const next = !o;
      if (next) {
        // À l'ouverture : focus initial sur l'option sélectionnée, sinon la 1re
        const initial = Math.max(
          0,
          options.findIndex((o) => o.value === value)
        );
        setFocusedIndex(initial);
        // En mode detached, on recalcule les coords du popover relativement
        // à la viewport avant le 1er rendu de la liste.
        if (detached && triggerRef.current) {
          const r = triggerRef.current.getBoundingClientRect();
          setFixedPos({ top: r.bottom + 4, left: r.left, width: r.width });
        }
      }
      return next;
    });
  }

  function close() {
    setOpen(false);
    setFocusedIndex(-1);
  }

  function selectOption(idx: number) {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    close();
    triggerRef.current?.focus();
  }

  // ----- Click extérieur (overlay z-40) -----------------------------------
  // Pattern identique à ShareButton — overlay invisible plein écran qui capte
  // le pointerdown. Plus fiable que `onBlur` qui se déclenche aussi sur les
  // clics internes (option) avant que l'event "select" n'ait été géré.

  // ----- Échap pour fermer ------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ----- Scroll automatique sur l'option focusée -------------------------
  // Quand on navigue avec les flèches, on s'assure que l'option focusée est
  // visible dans le viewport de la liste (max-h-60 + overflow-y-auto).
  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLLIElement>(
      `[data-option-index="${focusedIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, focusedIndex]);

  // ----- Auto-focus de la liste à l'ouverture ----------------------------
  // Nécessaire pour que les flèches haut/bas soient captées par `onKeyDown`
  // de la <ul>. Si on focusait pas, le focus resterait sur le bouton trigger
  // et la liste ne recevrait jamais d'événement clavier.
  useEffect(() => {
    if (open) {
      // Micro-délai requis : sans ça, le focus se voit voler par le clic
      // qui vient d'ouvrir la liste (Chrome notamment).
      const t = setTimeout(() => listRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ----- Gestion clavier sur le trigger ----------------------------------
  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ": // Espace
        // Ouvre si fermé, sinon délègue à la liste
        if (!open) {
          e.preventDefault();
          toggle();
        }
        break;
      case "Tab":
        // Tab ferme silencieusement et laisse le focus passer au champ suivant
        if (open) close();
        break;
    }
  }

  // ----- Gestion clavier dans la liste -----------------------------------
  function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedIndex >= 0) selectOption(focusedIndex);
        break;
      case "Tab":
        // Tab ferme et laisse le focus passer (comportement natif preserve)
        close();
        break;
    }
  }

  // ----- Rendu trigger ----------------------------------------------------
  const triggerClasses = cn(
    "inline-flex items-center justify-between gap-2 w-full rounded-xl px-3 py-2.5 text-sm transition-[background-color,box-shadow,transform] duration-150 [transition-timing-function:var(--ease-swift-out)]",
    variant === "input"
      ? "bg-brand-50 hover:bg-white border border-brand-200/60 focus:outline-none focus:ring-2 focus:ring-brand-500"
      : "bg-transparent hover:bg-brand-100 border border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500",
    open && "ring-2 ring-brand-500 bg-white",
    disabled && "opacity-50 cursor-not-allowed",
    "active:scale-[0.99]",
    className
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && focusedIndex >= 0
            ? `${baseId}-opt-${focusedIndex}`
            : undefined
        }
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        className={triggerClasses}
      >
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 truncate",
            !selectedOption && "text-brand-700/50"
          )}
        >
          {selectedOption?.icon && (
            <span className="shrink-0 text-brand-700">{selectedOption.icon}</span>
          )}
          <span className="truncate">
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-brand-700/60 transition-transform duration-200 [transition-timing-function:var(--ease-swift-out)]",
            open && "rotate-180 text-brand-700"
          )}
        />
      </button>

      {/* Overlay click-outside (z-40, sous le popover en z-50) */}
      {open && (
        <div
          aria-hidden
          onClick={close}
          // En mode detached, l'overlay couvre tout le viewport.
          // En mode normal aussi : c'est plus simple et toujours correct.
          className="fixed inset-0 z-40"
        />
      )}

      {/* Popover liste */}
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          style={
            detached && fixedPos
              ? {
                  position: "fixed",
                  top: fixedPos.top,
                  left: fixedPos.left,
                  width: fixedPos.width,
                }
              : undefined
          }
          className={cn(
            // - `isolate` : crée un stacking context isolé pour empêcher le compositor
            //   d'optimiser/composer le popover avec ses voisins (overlay click-outside,
            //   carrousels). Évite des artefacts GPU sur Chrome Android.
            // - `transform-gpu` : force `translateZ(0)` → le browser PRÉ-ALLOUE un
            //   compositing layer dédié AVANT l'animation au lieu de le créer
            //   dynamiquement (source de glitchs sur GPU Mali / Adreno anciens).
            // - `will-change-[opacity,transform]` : signal hint au browser que ces deux
            //   propriétés vont changer → idem, pré-allocation du layer GPU.
            "isolate z-50 max-h-60 overflow-y-auto overflow-x-hidden rounded-xl border border-brand-200 bg-white p-1 shadow-[var(--shadow-card-hover)] outline-none animate-popover-in origin-top-left transform-gpu will-change-[opacity,transform]",
            // En mode normal (absolute) : positionné juste sous le trigger
            !detached && "absolute left-0 right-0 top-full mt-1.5 min-w-full"
          )}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isFocused = idx === focusedIndex;
            return (
              <li
                key={opt.value}
                id={`${baseId}-opt-${idx}`}
                data-option-index={idx}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setFocusedIndex(idx)}
                onClick={() => selectOption(idx)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors duration-100 [transition-timing-function:var(--ease-swift-out)]",
                  isFocused
                    ? "bg-brand-100 text-brand-900"
                    : "text-brand-900 hover:bg-brand-50",
                  isSelected && "font-medium"
                )}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  {opt.icon && (
                    <span className="shrink-0 text-brand-700">{opt.icon}</span>
                  )}
                  <span className="truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="ml-1 truncate text-xs text-brand-700/60">
                      {opt.hint}
                    </span>
                  )}
                </span>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-accent-500" />
                )}
              </li>
            );
          })}
          {options.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-brand-700/50">
              Aucune option
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
