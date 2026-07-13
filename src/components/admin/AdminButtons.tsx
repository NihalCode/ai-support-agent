"use client";

import {
  adminButton,
  adminDangerButton,
  adminGhostButton,
} from "@/components/admin/tokens";

export function AdminButton({
  children,
  type = "button",
  disabled,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`${adminButton} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function AdminDangerButton({
  children,
  disabled,
  confirmMessage,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  confirmMessage?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={adminDangerButton}
      disabled={disabled}
      onClick={() => {
        if (!confirmMessage || window.confirm(confirmMessage)) onClick();
      }}
    >
      {children}
    </button>
  );
}

export function AdminGhostButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={adminGhostButton}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function AdminActionButton({
  label,
  busy,
  danger,
  confirm,
  onClick,
}: {
  label: string;
  busy: boolean;
  danger?: boolean;
  confirm?: string;
  onClick: () => void;
}) {
  const className = danger ? adminDangerButton : adminButton;
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => {
        if (!confirm || window.confirm(confirm)) onClick();
      }}
    >
      {label}
    </button>
  );
}
