"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AppSelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface AppSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: AppSelectOption<T>[];
  id?: string;
  label?: string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  testId?: string;
  title?: string;
}

const MENU_MAX_HEIGHT = 240;

/** Accessible custom select with dark-theme contrast (avoids native OS menu styling). */
export function AppSelect<T extends string = string>({
  value,
  onChange,
  options,
  id: idProp,
  label,
  "aria-label": ariaLabel,
  disabled = false,
  className,
  triggerClassName,
  testId,
  title,
}: AppSelectProps<T>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listboxId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  const close = useCallback(() => setOpen(false), []);

  const repositionMenu = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let top = rect.bottom + gap;
    let maxHeight = MENU_MAX_HEIGHT;

    if (spaceBelow < 120 && spaceAbove > spaceBelow) {
      maxHeight = Math.min(MENU_MAX_HEIGHT, spaceAbove);
      top = Math.max(8, rect.top - maxHeight - gap);
    } else {
      maxHeight = Math.min(MENU_MAX_HEIGHT, Math.max(spaceBelow, 80));
    }

    setMenuPos({
      top,
      left: rect.left,
      width: Math.max(rect.width, 160),
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    repositionMenu();
    window.addEventListener("scroll", repositionMenu, true);
    window.addEventListener("resize", repositionMenu);
    return () => {
      window.removeEventListener("scroll", repositionMenu, true);
      window.removeEventListener("resize", repositionMenu);
    };
  }, [open, repositionMenu]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) setHighlight(idx);
  }, [value, options]);

  function selectOption(opt: AppSelectOption<T>) {
    if (opt.disabled) return;
    onChange(opt.value);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) selectOption(options[highlight] ?? options[0]);
      else setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else {
        let next = highlight + 1;
        while (next < options.length && options[next]?.disabled) next += 1;
        if (next < options.length) setHighlight(next);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      else {
        let prev = highlight - 1;
        while (prev >= 0 && options[prev]?.disabled) prev -= 1;
        if (prev >= 0) setHighlight(prev);
      }
    }
  }

  const menu =
    open && menuPos ? (
      <ul
        ref={menuRef}
        id={listboxId}
        role="listbox"
        aria-labelledby={`${id}-trigger`}
        className="app-select-menu app-select-menu--portal"
        data-testid={testId ? `${testId}-menu` : undefined}
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxHeight,
        }}
      >
        {options.map((opt, i) => (
          <li
            key={opt.value}
            role="option"
            aria-selected={opt.value === value}
            aria-disabled={opt.disabled || undefined}
            className={cn(
              "app-select-option",
              opt.value === value && "app-select-option--selected",
              opt.disabled && "app-select-option--disabled",
              i === highlight && "app-select-option--highlight"
            )}
            onMouseEnter={() => !opt.disabled && setHighlight(i)}
            onClick={() => selectOption(opt)}
          >
            {opt.label}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className={cn("app-select", className)} data-testid={testId}>
      {label ? (
        <label htmlFor={`${id}-trigger`} className="app-select-label">
          {label}
        </label>
      ) : null}
      <button
        type="button"
        id={`${id}-trigger`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? label ?? selected?.label}
        disabled={disabled}
        title={title ?? selected?.label}
        className={cn("app-select-trigger", triggerClassName, disabled && "app-select-trigger--disabled")}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        <span className="app-select-value">{selected?.label ?? value}</span>
        <ChevronDown className="app-select-chevron" aria-hidden />
      </button>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
