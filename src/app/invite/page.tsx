"use client";

import { Suspense } from "react";

import InviteClient from "./InviteClient";

export default function InvitePageWrapper() {
  return (
    <Suspense
      fallback={
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
          Loading…
        </main>
      }
    >
      <InviteClient />
    </Suspense>
  );
}
