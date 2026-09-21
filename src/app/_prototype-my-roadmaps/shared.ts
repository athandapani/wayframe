// PROTOTYPE — throwaway. Mock "My Roadmaps" data + helpers shared by all
// three variants, standing in for the real GET /api/portfolios/mine
// replacement wayframe#123 will build (blocked on this prototype ticket,
// wayframe#122). Portfolio has no `title` field today (see types.ts) — a
// real landing page will need to decide how a Roadmap gets a display name
// (first Program's programName? an owner-set title?); these mocks assume a
// title exists so the layout question can be answered independently of
// that still-open one.

export type Role = "owner" | "editor" | "viewer";

export interface MockRoadmap {
  id: string;
  title: string;
  role: Role;
  programCount: number;
  memberCount: number;
  updatedAt: string; // ISO
}

// Deliberately uneven: mixed roles, mixed program counts, mixed recency —
// exercises owned-first ordering, role badges, and both "just now" and
// "weeks ago" ends of the relative-time formatter.
export const INITIAL_ROADMAPS: MockRoadmap[] = [
  {
    id: "pf-atlas",
    title: "Atlas Platform Roadmap",
    role: "owner",
    programCount: 3,
    memberCount: 5,
    updatedAt: "2026-09-21T13:40:00Z",
  },
  {
    id: "pf-comet",
    title: "Comet Mobile Launch",
    role: "owner",
    programCount: 1,
    memberCount: 2,
    updatedAt: "2026-09-18T09:05:00Z",
  },
  {
    id: "pf-nova",
    title: "Nova Infra Migration",
    role: "editor",
    programCount: 2,
    memberCount: 8,
    updatedAt: "2026-09-20T22:15:00Z",
  },
  {
    id: "pf-vega",
    title: "Vega Q4 GTM Plan",
    role: "viewer",
    programCount: 4,
    memberCount: 12,
    updatedAt: "2026-09-10T16:00:00Z",
  },
  {
    id: "pf-orion",
    title: "Orion Data Platform",
    role: "viewer",
    programCount: 1,
    memberCount: 3,
    updatedAt: "2026-08-29T11:30:00Z",
  },
];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

// Owner is the identity used for sharing/deletion elsewhere in the app
// (AuthControls-adjacent copy); editor/viewer read as progressively lower
// contrast so the eye lands on "yours" first in any layout.
export const ROLE_BADGE_CLASS: Record<Role, string> = {
  owner: "bg-violet-100 text-violet-700",
  editor: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-600",
};

export function formatRelative(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

// owner-first, then by recency within each role tier — matches wayframe#119's
// "owned-first" decision without hiding editor/viewer access entirely.
export function sortRoadmaps(roadmaps: MockRoadmap[]): MockRoadmap[] {
  const roleRank: Record<Role, number> = { owner: 0, editor: 1, viewer: 2 };
  return [...roadmaps].sort((a, b) => {
    if (roleRank[a.role] !== roleRank[b.role]) return roleRank[a.role] - roleRank[b.role];
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

let mockIdCounter = 0;

export function makeNewRoadmap(now: Date): MockRoadmap {
  mockIdCounter += 1;
  return {
    id: `pf-new-${mockIdCounter}`,
    title: "Untitled Roadmap",
    role: "owner",
    programCount: 0,
    memberCount: 1,
    updatedAt: now.toISOString(),
  };
}
