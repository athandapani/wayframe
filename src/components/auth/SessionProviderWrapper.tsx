"use client";

import { SessionProvider } from "next-auth/react";

// src/app/layout.tsx is a server component (it exports `metadata`), which
// can't itself call SessionProvider — this thin wrapper is the client
// boundary that lets `useSession()` work anywhere under it (wayframe#t17).
export function SessionProviderWrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
