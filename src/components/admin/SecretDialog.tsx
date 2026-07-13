"use client";

import { useEffect, useRef } from "react";

import { AdminButton } from "@/components/admin/AdminButtons";
import { adminInput } from "@/components/admin/tokens";

export function SecretDialog({
  secret,
  onClose,
}: {
  secret: string | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (secret && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [secret]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="admin-secret-title"
      onClose={onClose}
      className="m-auto max-w-lg rounded-2xl border border-violet-400/40 bg-slate-950 p-0 text-slate-100 backdrop:bg-black/75"
    >
      <div className="p-6">
        <h2 id="admin-secret-title" className="text-xl font-semibold">
          Copy this secret now
        </h2>
        <p className="mt-2 text-sm text-amber-200">
          This is the only time the secret can be viewed. Store it in your vault
          immediately.
        </p>
        <code className="mt-4 block overflow-auto rounded-lg bg-black p-3 text-sm">
          {secret}
        </code>
        <form method="dialog" className="mt-5 text-right">
          <AdminButton>I have stored it securely</AdminButton>
        </form>
      </div>
    </dialog>
  );
}

export function AdminSearchInput({
  name,
  value,
  onChange,
  placeholder,
  minLength,
  maxLength,
  required,
}: {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <input
      className={adminInput}
      name={name}
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      placeholder={placeholder}
      minLength={minLength}
      maxLength={maxLength}
      required={required}
    />
  );
}
