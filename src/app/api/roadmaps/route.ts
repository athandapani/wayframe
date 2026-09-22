import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import {
  createPortfolioWithOwner,
  listMembers,
  listMembershipsForIdentity,
  setPortfolioContent,
  type Role,
} from "@/lib/db/portfolios";
import { decodeProgramSnapshot, listProgramSnapshotsForPortfolio } from "@/lib/db/program-storage";
import { CURRENT_SCHEMA_VERSION } from "@/lib/document-file/schema";

/**
 * wayframe#123: the real "My Roadmaps" data endpoint, replacing #122's
 * mock-data prototype (Option C, sidebar list + detail pane — see #122's
 * resolution). Every Portfolio the signed-in identity has a
 * `portfolio_members` row on, owner-first then most-recently-updated.
 *
 * A Roadmap has no owner-set title yet (#122's flagged open question,
 * deliberately not resolved as a new document-content field here — no
 * Roadmap has ever needed one before this page, and nothing in #119's
 * decision asked for one). Its display title is derived: the first
 * Program's `programName` (by `order`), or "Untitled Roadmap" for a
 * freshly-created empty Roadmap with no Program yet.
 */
export interface RoadmapSummary {
  id: string;
  title: string;
  role: Role;
  programCount: number;
  memberCount: number;
  updatedAt: string;
}

const ROLE_RANK: Record<Role, number> = { owner: 0, editor: 1, viewer: 2 };

export async function GET() {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ roadmaps: [] });

  const memberships = await listMembershipsForIdentity(identity);

  const roadmaps: RoadmapSummary[] = await Promise.all(
    memberships.map(async (m): Promise<RoadmapSummary> => {
      const [snapshotRows, members] = await Promise.all([
        listProgramSnapshotsForPortfolio(m.portfolioId),
        listMembers(m.portfolioId),
      ]);

      const programs = snapshotRows
        .map((row) => decodeProgramSnapshot(row.snapshot))
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .sort((a, b) => a.order - b.order);

      const updatedAt = snapshotRows.reduce((latest, row) => (row.updatedAt > latest ? row.updatedAt : latest), m.portfolioCreatedAt);

      return {
        id: m.portfolioId,
        title: programs[0]?.programName ?? "Untitled Roadmap",
        role: m.role,
        programCount: programs.length,
        memberCount: members.length,
        updatedAt,
      };
    }),
  );

  roadmaps.sort((a, b) => {
    if (ROLE_RANK[a.role] !== ROLE_RANK[b.role]) return ROLE_RANK[a.role] - ROLE_RANK[b.role];
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return NextResponse.json({ roadmaps });
}

/**
 * "+ New Roadmap" (#122/#130's landing-page destination). Creates an empty
 * hosted Portfolio — owner membership, no Programs yet — via
 * createPortfolioWithOwner (wayframe#t17's primitive, previously only
 * exercised by the local-artifact migration trigger). The client is
 * expected to land on `/p/[portfolioId]` next, whose empty-Portfolio state
 * offers EntryForm inline to create the first Program.
 */
export async function POST() {
  const session = await auth();
  const identity = session?.user?.id;
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const portfolioId = crypto.randomUUID();
  await createPortfolioWithOwner(portfolioId, identity);
  await setPortfolioContent(portfolioId, { schemaVersion: CURRENT_SCHEMA_VERSION });

  return NextResponse.json({ id: portfolioId });
}
