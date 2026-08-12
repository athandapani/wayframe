import { describe, expect, it } from "vitest";
import type { Milestone, TopLevelItem } from "@/components/timeline/types";
import { applyAddMilestoneOps, applyAddTopLevelItemOps, applyAttachmentOps, applyDependencyOps, applyOps, applyTopLevelItemOps } from "./apply";
import type { AddTopLevelItemOp, AttachmentOp, DependencyOp, PatchOp, TopLevelItemOp } from "./schema";

function milestone(overrides: Partial<Milestone> & Pick<Milestone, "id" | "date">): Milestone {
  return {
    laneId: "lane-1",
    title: overrides.id,
    status: "not-started",
    dependsOn: [],
    linksToTopLevelMilestone: null,
    isCriticalPath: false,
    ...overrides,
  };
}

describe("applyOps", () => {
  it("stamps originalDate the first time a milestone's date shifts", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01" })];
    const ops: PatchOp[] = [{ targetId: "m1", field: "date", newValue: "2026-01-08", reason: "shifted" }];

    const result = applyOps(milestones, ops);
    expect(result[0].date).toBe("2026-01-08");
    expect(result[0].originalDate).toBe("2026-01-01");
  });

  it("does not move the baseline on a second shift", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-08", originalDate: "2026-01-01" })];
    const ops: PatchOp[] = [{ targetId: "m1", field: "date", newValue: "2026-01-15", reason: "shifted again" }];

    const result = applyOps(milestones, ops);
    expect(result[0].date).toBe("2026-01-15");
    expect(result[0].originalDate).toBe("2026-01-01");
  });

  it("applies a status op without touching date fields", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01", status: "not-started" })];
    const ops: PatchOp[] = [{ targetId: "m1", field: "status", newValue: "complete", reason: "marked complete" }];

    const result = applyOps(milestones, ops);
    expect(result[0].status).toBe("complete");
    expect(result[0].date).toBe("2026-01-01");
    expect(result[0].originalDate).toBeUndefined();
  });

  it("leaves milestones with no matching op untouched", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01" }), milestone({ id: "m2", date: "2026-02-01" })];
    const ops: PatchOp[] = [{ targetId: "m1", field: "date", newValue: "2026-01-08", reason: "shifted" }];

    const result = applyOps(milestones, ops);
    expect(result[1]).toBe(milestones[1]);
  });

  it("applies every field a manual edit can touch (wayframe#18/#19) in one batch", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01", owner: "A. Boyer" })];
    const ops: PatchOp[] = [
      { targetId: "m1", field: "title", newValue: "New Title", reason: "manual edit" },
      { targetId: "m1", field: "percentComplete", newValue: 40, reason: "manual edit" },
      { targetId: "m1", field: "isCriticalPathOverride", newValue: true, reason: "manual edit" },
      { targetId: "m1", field: "shortLabel", newValue: "NT", reason: "manual edit" },
    ];

    const result = applyOps(milestones, ops);
    expect(result[0]).toMatchObject({ title: "New Title", percentComplete: 40, isCriticalPathOverride: true, shortLabel: "NT" });
  });

  it("applies a showReferenceLine op (wayframe#48)", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01", showReferenceLine: false })];
    const ops: PatchOp[] = [{ targetId: "m1", field: "showReferenceLine", newValue: true, reason: "manual edit" }];

    const result = applyOps(milestones, ops);
    expect(result[0].showReferenceLine).toBe(true);
  });

  it("clears an optional field (owner/comment/shortLabel) when the op's newValue is an empty string", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01", owner: "A. Boyer", comment: "note", shortLabel: "AB" })];
    const ops: PatchOp[] = [
      { targetId: "m1", field: "owner", newValue: "", reason: "cleared" },
      { targetId: "m1", field: "comment", newValue: "", reason: "cleared" },
      { targetId: "m1", field: "shortLabel", newValue: "", reason: "cleared" },
    ];

    const result = applyOps(milestones, ops);
    expect(result[0].owner).toBeUndefined();
    expect(result[0].comment).toBeUndefined();
    expect(result[0].shortLabel).toBeUndefined();
  });
});

describe("applyAddMilestoneOps (wayframe#59)", () => {
  it("creates a duration-pill milestone when the op carries an endDate", () => {
    const result = applyAddMilestoneOps([
      { op: { title: "Ramp", laneId: "lane-1", date: null, endDate: "2026-02-01", reason: "r" }, id: "new-1", date: "2026-01-01" },
    ]);
    expect(result[0]).toMatchObject({ id: "new-1", date: "2026-01-01", endDate: "2026-02-01" });
  });

  it("leaves endDate undefined for a plain point milestone", () => {
    const result = applyAddMilestoneOps([{ op: { title: "M", laneId: "lane-1", date: null, reason: "r" }, id: "new-1", date: "2026-01-01" }]);
    expect(result[0].endDate).toBeUndefined();
  });
});

describe("applyTopLevelItemOps (wayframe#59)", () => {
  const milestoneItem: TopLevelItem = { id: "t1", type: "milestone", title: "GA", date: "2026-01-01", status: "not-started" };
  const annotationItem: TopLevelItem = { id: "t2", type: "annotation", title: "Board Review", date: "2026-02-01", message: "old note" };

  it("applies multiple ops targeting the same item in one batch", () => {
    const ops: TopLevelItemOp[] = [
      { targetId: "t1", field: "title", newValue: "General Availability", reason: "r" },
      { targetId: "t1", field: "date", newValue: "2026-03-01", reason: "r" },
      { targetId: "t1", field: "showReferenceLine", newValue: true, reason: "r" },
    ];
    const result = applyTopLevelItemOps([milestoneItem], ops);
    expect(result[0]).toMatchObject({ title: "General Availability", date: "2026-03-01", showReferenceLine: true });
  });

  it("applies an annotation's message field", () => {
    const ops: TopLevelItemOp[] = [{ targetId: "t2", field: "message", newValue: "new note", reason: "r" }];
    const result = applyTopLevelItemOps([annotationItem], ops);
    expect(result[0]).toMatchObject({ message: "new note" });
  });

  it("leaves items with no matching op untouched", () => {
    const result = applyTopLevelItemOps([milestoneItem, annotationItem], [{ targetId: "t1", field: "title", newValue: "X", reason: "r" }]);
    expect(result[1]).toBe(annotationItem);
  });
});

describe("applyAddTopLevelItemOps (wayframe#59)", () => {
  it("creates a milestone", () => {
    const op: AddTopLevelItemOp = { kind: "milestone", title: "GA", date: null, reason: "r" };
    const result = applyAddTopLevelItemOps([{ op, id: "new-1", date: "2026-01-01" }]);
    expect(result[0]).toEqual({ id: "new-1", type: "milestone", title: "GA", date: "2026-01-01", status: "not-started" });
  });

  it("creates a phase spanning date to endDate", () => {
    const op: AddTopLevelItemOp = { kind: "phase", title: "Build", date: null, endDate: null, reason: "r" };
    const result = applyAddTopLevelItemOps([{ op, id: "new-1", date: "2026-01-01", endDate: "2026-03-01" }]);
    expect(result[0]).toEqual({ id: "new-1", type: "phase", title: "Build", status: "not-started", startDate: "2026-01-01", endDate: "2026-03-01" });
  });

  it("creates an annotation carrying its message", () => {
    const op: AddTopLevelItemOp = { kind: "annotation", title: "Board Review", date: null, message: "funding decision", reason: "r" };
    const result = applyAddTopLevelItemOps([{ op, id: "new-1", date: "2026-03-03" }]);
    expect(result[0]).toEqual({ id: "new-1", type: "annotation", title: "Board Review", date: "2026-03-03", message: "funding decision" });
  });
});

describe("applyDependencyOps (wayframe#59)", () => {
  function milestone2(overrides: Partial<Milestone> & Pick<Milestone, "id" | "date">): Milestone {
    return { laneId: "lane-1", title: overrides.id, status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false, ...overrides };
  }

  it("adds an edge defaulting showConnector to true when unset", () => {
    const milestones = [milestone2({ id: "a", date: "2026-01-01" }), milestone2({ id: "b", date: "2026-02-01" })];
    const ops: DependencyOp[] = [{ dependentId: "b", dependencyId: "a", add: true, reason: "r" }];
    const result = applyDependencyOps(milestones, ops);
    expect(result.find((m) => m.id === "b")!.dependsOn).toEqual([{ id: "a", showConnector: true }]);
  });

  it("respects an explicit showConnector: false", () => {
    const milestones = [milestone2({ id: "a", date: "2026-01-01" }), milestone2({ id: "b", date: "2026-02-01" })];
    const ops: DependencyOp[] = [{ dependentId: "b", dependencyId: "a", add: true, showConnector: false, reason: "r" }];
    const result = applyDependencyOps(milestones, ops);
    expect(result.find((m) => m.id === "b")!.dependsOn).toEqual([{ id: "a", showConnector: false }]);
  });

  it("removes an existing edge", () => {
    const milestones = [
      milestone2({ id: "a", date: "2026-01-01" }),
      milestone2({ id: "b", date: "2026-02-01", dependsOn: [{ id: "a", showConnector: true }] }),
    ];
    const ops: DependencyOp[] = [{ dependentId: "b", dependencyId: "a", add: false, reason: "r" }];
    const result = applyDependencyOps(milestones, ops);
    expect(result.find((m) => m.id === "b")!.dependsOn).toEqual([]);
  });

  it("ignores a self-referencing op", () => {
    const milestones = [milestone2({ id: "a", date: "2026-01-01" })];
    const ops: DependencyOp[] = [{ dependentId: "a", dependencyId: "a", add: true, reason: "r" }];
    const result = applyDependencyOps(milestones, ops);
    expect(result[0].dependsOn).toEqual([]);
  });
});

describe("applyAttachmentOps (wayframe#55/#60)", () => {
  it("appends an attachment when no index is given", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01", attachments: [{ type: "link", url: "https://a" }] })];
    const ops: AttachmentOp[] = [{ targetId: "m1", action: "add", attachment: { type: "image", url: "https://b" }, reason: "r" }];
    const result = applyAttachmentOps(milestones, ops);
    expect(result[0].attachments).toEqual([{ type: "link", url: "https://a" }, { type: "image", url: "https://b" }]);
  });

  it("creates the attachments array when the milestone has none yet", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01" })];
    const ops: AttachmentOp[] = [{ targetId: "m1", action: "add", attachment: { type: "link", url: "https://a" }, reason: "r" }];
    const result = applyAttachmentOps(milestones, ops);
    expect(result[0].attachments).toEqual([{ type: "link", url: "https://a" }]);
  });

  it("removes the attachment at the given index", () => {
    const milestones = [
      milestone({ id: "m1", date: "2026-01-01", attachments: [{ type: "link", url: "https://a" }, { type: "link", url: "https://b" }] }),
    ];
    const ops: AttachmentOp[] = [{ targetId: "m1", action: "remove", index: 0, reason: "r" }];
    const result = applyAttachmentOps(milestones, ops);
    expect(result[0].attachments).toEqual([{ type: "link", url: "https://b" }]);
  });

  it("reinserts at a given index — remove-then-add-at-index models the manual editor's in-place row edit", () => {
    const milestones = [
      milestone({ id: "m1", date: "2026-01-01", attachments: [{ type: "link", url: "https://a" }, { type: "link", url: "https://b" }] }),
    ];
    const ops: AttachmentOp[] = [
      { targetId: "m1", action: "remove", index: 0, reason: "r" },
      { targetId: "m1", action: "add", attachment: { type: "image", url: "https://edited" }, index: 0, reason: "r" },
    ];
    const result = applyAttachmentOps(milestones, ops);
    expect(result[0].attachments).toEqual([{ type: "image", url: "https://edited" }, { type: "link", url: "https://b" }]);
  });

  it("leaves milestones with no matching op untouched", () => {
    const milestones = [milestone({ id: "m1", date: "2026-01-01" }), milestone({ id: "m2", date: "2026-02-01" })];
    const ops: AttachmentOp[] = [{ targetId: "m1", action: "add", attachment: { type: "link", url: "https://a" }, reason: "r" }];
    const result = applyAttachmentOps(milestones, ops);
    expect(result[1]).toBe(milestones[1]);
  });
});
