"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspace } from "@/components/ide/WorkspaceProvider";
import type { ProductMode } from "@/lib/product-config";
import { cn } from "@/lib/cn";

export function ProductModeToggle() {
  const { productMode, setProductMode } = useWorkspace();
  const { canUseDeveloperMode } = useAuth();

  const options: { value: ProductMode; label: string }[] = [
    { value: "client", label: "Support Mode" },
    ...(canUseDeveloperMode ? [{ value: "developer" as const, label: "Developer Mode" }] : []),
  ];

  return (
    <div
      className="inline-flex items-center rounded-full border border-white/10 bg-slate-900/80 p-0.5 shrink-0 shadow-sm"
      data-testid="product-mode-toggle"
      role="radiogroup"
      aria-label="Client or Developer mode"
    >
      {options.map((opt) => {
        const active = productMode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`product-mode-toggle-${opt.value}`}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap leading-none",
              active
                ? opt.value === "client"
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "bg-violet-500/20 text-violet-100"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]"
            )}
            onClick={() => setProductMode(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
