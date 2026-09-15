"use client";

// One-time guest display-name capture (wayframe#t37) for someone following a
// public share link while signed out. Renders BEFORE RoadmapWorkspace mounts
// on this route, so the --wf-* theme vars it publishes aren't set anywhere
// yet — plain Tailwind neutrals only, same reasoning AuthControls.tsx's own
// styling follows. The captured name/guestId isn't consumed by anything live
// yet (PresenceAvatars stays out of scope here) — "store now, consume later,"
// same treatment t36 already established.
import { useState } from "react";

export function GuestNamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-900 shadow-lg">
        <h1 className="mb-1 text-base font-semibold">Join as a guest</h1>
        <p className="mb-3 text-xs text-gray-500">Enter a display name so others can see who&apos;s viewing this Portfolio.</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          className="mb-3 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
        />
        <button type="submit" disabled={!name.trim()} className="w-full rounded-full bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
          Continue
        </button>
      </form>
    </div>
  );
}
