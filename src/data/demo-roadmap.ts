// The official Wayframe demo dataset (wayframe issue #10) — used across
// screenshots, the live demo default state, and the demo GIF once those
// consumers exist. A fictional warehouse-robotics platform-launch program.
// Zero real-company references: "Atlas" is an invented product name, all
// people are invented, and attachment URLs point at example.com (IANA's
// reserved documentation domain) rather than any real host.
//
// `demoToday` is the reference "now" the statuses below were authored
// against (a milestone dated before it is complete/delayed; on/after it is
// not-started/on-track/at-risk) — pass it as RoadmapTimeline's `today` prop
// wherever this dataset is rendered so the status mix reads correctly.
import type { RoadmapData } from "@/components/timeline/types";

export const demoToday = new Date("2026-09-01T00:00:00Z");

export const demoRoadmap: RoadmapData = {
  schemaVersion: "1.0",
  programName: "Atlas Mobile Robot Platform — Launch Program",
  generatedAt: "2026-09-01T00:00:00.000Z",
  owner: "Dana Whitfield — VP, Robotics Programs",
  reportsTo: "Priya Natarajan — COO",
  nextReviewDate: "2026-09-15",
  bluf: {
    statement:
      "Atlas platform is on track for GA in February 2027; certification lab scheduling and a hardware long-lead shipment are the two active risks to watch.",
    bullets: [
      "Design Freeze and the core autonomy stack are complete; production tooling and Phase 2 ramp are the remaining hardware/manufacturing gates.",
      "UL 3100 certification lab slot slipped to Q4 2026 — now the critical-path pacing item for GA.",
      "Pilot Site 2 go-live is at risk on landlord-side network infrastructure; Sites 1 and 3 are unaffected.",
      "Commercial readiness (pricing, channel agreements) is ahead of engineering; launch enablement is gated on certification and pilot uptime proof points.",
    ],
  },
  actionItems: [
    { id: "action-1", text: "Escalate the UL 3100 certification lab slot with the certifying body", owner: "T. Boyer — Safety & Compliance", dueDate: "2026-09-08" },
    { id: "action-2", text: "Confirm motor-controller dual-sourcing to de-risk the long-lead shipment", owner: "R. Alvarez — Hardware Eng Lead", dueDate: "2026-09-10" },
    { id: "action-3", text: "Get a firm network-infrastructure timeline from the Pilot Site 2 landlord", owner: "K. Simmons — Field Ops", dueDate: "2026-09-12" },
    { id: "action-4", text: "Publish the GA readiness scorecard ahead of the Board Review", owner: "Dana Whitfield — VP, Robotics Programs", dueDate: "2026-09-14" },
  ],
  swimlanes: [
    { id: "sep-eng", order: 0, type: "separator", name: "Engineering & Certification" },
    { id: "lane-mech", order: 1, type: "lane", name: "Mechanical & Hardware" },
    { id: "lane-auto", order: 2, type: "lane", name: "Autonomy & Perception Software" },
    { id: "lane-safety", order: 3, type: "lane", name: "Safety Certification" },
    { id: "sep-comm", order: 4, type: "separator", name: "Commercialization" },
    { id: "lane-mfg", order: 5, type: "lane", name: "Manufacturing & Supply Chain" },
    { id: "lane-pilot", order: 6, type: "lane", name: "Field Pilot Deployments" },
    { id: "lane-launch", order: 7, type: "lane", name: "Commercial Launch" },
  ],
  topLevelItems: [
    { id: "top-concept-phase", type: "phase", title: "Concept & Requirements", startDate: "2025-06-01", endDate: "2025-09-15", status: "complete" },
    { id: "top-kickoff", type: "milestone", title: "Program Kickoff", date: "2025-09-15", status: "complete" },
    { id: "top-design-phase", type: "phase", title: "Design & Build", startDate: "2025-09-15", endDate: "2026-06-01", status: "complete" },
    { id: "top-design-freeze", type: "milestone", title: "Design Freeze", date: "2026-03-01", status: "complete" },
    { id: "top-cert-phase", type: "phase", title: "Certification & Pilot", startDate: "2026-06-01", endDate: "2026-12-15", status: "on-track" },
    { id: "top-ga", type: "milestone", title: "General Availability", date: "2027-02-01", status: "on-track", showReferenceLine: true },
    { id: "top-board-review", type: "annotation", title: "Board Review", date: "2026-09-15", message: "Quarterly steering committee checkpoint — go/no-go for pilot-to-production ramp" },
  ],
  milestones: [
    // Mechanical & Hardware
    { id: "mech-1", laneId: "lane-mech", title: "Chassis Concept Review", date: "2025-08-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "mech-2", laneId: "lane-mech", title: "Drivetrain Prototype Build", date: "2025-11-15", status: "complete", owner: "R. Alvarez — Hardware Eng Lead", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "mech-3", laneId: "lane-mech", title: "Gripper Module Design Freeze", date: "2026-02-10", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "mech-4", laneId: "lane-mech", title: "Ruggedized Enclosure Qualification", date: "2026-05-20", status: "complete", owner: "R. Alvarez — Hardware Eng Lead", comment: "Passed vibration and ingress testing at outside lab.", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "mech-5", laneId: "lane-mech", title: "Pilot-Build Hardware Lot (x10)", date: "2026-09-25", status: "at-risk", owner: "R. Alvarez — Hardware Eng Lead", comment: "Long-lead motor controller shipment slipped 3 weeks.", percentComplete: 70, dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: true },
    { id: "mech-6", laneId: "lane-mech", title: "Production Tooling Sign-off", date: "2027-01-10", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },

    // Autonomy & Perception Software
    { id: "auto-1", laneId: "lane-auto", title: "Perception Stack Architecture", date: "2025-08-15", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "auto-2", laneId: "lane-auto", title: "SLAM Localization Alpha", date: "2025-12-01", status: "complete", owner: "N. Kessler — Autonomy Lead", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "auto-3", laneId: "lane-auto", title: "Obstacle-Avoidance Beta", date: "2026-04-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: true },
    { id: "auto-4", laneId: "lane-auto", title: "Fleet Coordination Software v1", date: "2026-09-20", status: "on-track", owner: "N. Kessler — Autonomy Lead", dependsOn: [{ id: "auto-3", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },
    { id: "auto-5", laneId: "lane-auto", title: "Perception Accuracy Field Validation", date: "2026-10-15", status: "at-risk", owner: "N. Kessler — Autonomy Lead", comment: "Dust/low-light false-negative rate above target in the Warehouse B testbed.", percentComplete: 60, dependsOn: [{ id: "auto-4", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },
    { id: "auto-6", laneId: "lane-auto", title: "Autonomy Release Candidate", date: "2026-11-01", status: "not-started", dependsOn: [{ id: "auto-5", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true },

    // Safety Certification
    { id: "safety-1", laneId: "lane-safety", title: "Hazard Analysis (Preliminary)", date: "2025-10-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "safety-2", laneId: "lane-safety", title: "Functional Safety Plan (IEC 61508-aligned)", date: "2026-01-15", status: "complete", dependsOn: [{ id: "safety-1", showConnector: false }], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "safety-3", laneId: "lane-safety", title: "UL 3100 Pre-Assessment", date: "2026-05-01", status: "complete", owner: "T. Boyer — Safety & Compliance", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "safety-4", laneId: "lane-safety", title: "Third-Party Safety Lab Testing", date: "2026-10-20", status: "delayed", owner: "T. Boyer — Safety & Compliance", comment: "Lab slot pushed to Q4 due to backlog at the certifying body.", percentComplete: 40, dependsOn: [{ id: "mech-5", showConnector: true }], linksToTopLevelMilestone: null, isCriticalPath: true, showReferenceLine: true },
    { id: "safety-5", laneId: "lane-safety", title: "UL 3100 Certification Issued", date: "2026-12-15", status: "not-started", owner: "T. Boyer — Safety & Compliance", attachments: [{ type: "link", url: "https://example.com/wayframe-demo/ul3100-certificate.pdf", label: "UL 3100 Certificate (PDF)" }], dependsOn: [{ id: "safety-4", showConnector: true }], linksToTopLevelMilestone: "top-ga", isCriticalPath: true },

    // Manufacturing & Supply Chain
    { id: "mfg-1", laneId: "lane-mfg", title: "Contract Manufacturer Selection", date: "2025-09-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "mfg-2", laneId: "lane-mfg", title: "Long-Lead Component Sourcing (Motors, Lidar)", date: "2025-12-15", status: "complete", comment: "Dual-sourced lidar to de-risk a single supplier.", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "mfg-3", laneId: "lane-mfg", title: "Pilot Line Bring-up", date: "2026-09-15", endDate: "2026-09-28", status: "on-track", owner: "J. O'Hara — Supply Chain Mgr", percentComplete: 55, dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "mfg-4", laneId: "lane-mfg", title: "Supplier PPAP Approval", date: "2026-10-01", status: "on-track", owner: "J. O'Hara — Supply Chain Mgr", dependsOn: [{ id: "mfg-3", showConnector: false }], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "mfg-5", laneId: "lane-mfg", title: "Production Ramp — Phase 1 (50 units/mo)", date: "2027-01-15", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "mfg-6", laneId: "lane-mfg", title: "Production Ramp — Phase 2 (200 units/mo)", date: "2027-04-01", status: "not-started", dependsOn: [{ id: "mfg-5", showConnector: false }], linksToTopLevelMilestone: null, isCriticalPath: false },

    // Field Pilot Deployments
    { id: "pilot-1", laneId: "lane-pilot", title: "Pilot Site Selection (3 warehouses)", date: "2026-03-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "pilot-2", laneId: "lane-pilot", title: "Pilot Site 1 Go-Live", date: "2026-07-01", status: "complete", owner: "K. Simmons — Field Ops", attachments: [{ type: "image", url: "https://example.com/wayframe-demo/pilot-site-1-floor-plan.png", label: "Pilot Site 1 floor plan" }], dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "pilot-3", laneId: "lane-pilot", title: "Pilot Site 2 Go-Live", date: "2026-09-20", status: "at-risk", owner: "K. Simmons — Field Ops", comment: "Site network infra delayed by the facility landlord.", percentComplete: 65, dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "pilot-4", laneId: "lane-pilot", title: "Pilot Site 3 Go-Live", date: "2026-11-01", status: "not-started", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: true },
    { id: "pilot-5", laneId: "lane-pilot", title: "Pilot Fleet Uptime ≥ 95% Sustained (30 days)", date: "2027-01-05", status: "not-started", owner: "K. Simmons — Field Ops", dependsOn: [{ id: "pilot-4", showConnector: true }], linksToTopLevelMilestone: "top-ga", isCriticalPath: true },

    // Commercial Launch
    { id: "launch-1", laneId: "lane-launch", title: "Pricing & Packaging Finalized", date: "2026-06-01", status: "complete", dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "launch-2", laneId: "lane-launch", title: "Channel Partner Agreements Signed", date: "2026-09-10", status: "on-track", owner: "M. Delgado — GTM Lead", percentComplete: 50, dependsOn: [], linksToTopLevelMilestone: null, isCriticalPath: false },
    { id: "launch-3", laneId: "lane-launch", title: "Sales Enablement & Demo Kit Ready", date: "2026-11-15", status: "not-started", dependsOn: [{ id: "launch-2", showConnector: false }], linksToTopLevelMilestone: null, isCriticalPath: false },
    {
      id: "launch-4",
      laneId: "lane-launch",
      title: "General Availability Launch",
      date: "2027-02-01",
      status: "not-started",
      owner: "M. Delgado — GTM Lead",
      attachments: [{ type: "link", url: "https://example.com/wayframe-demo/launch-readiness-review.pdf", label: "Launch Readiness Review deck" }],
      dependsOn: [
        { id: "safety-5", showConnector: true },
        { id: "pilot-5", showConnector: true },
        { id: "auto-6", showConnector: false },
      ],
      linksToTopLevelMilestone: "top-ga",
      isCriticalPath: true,
    },
  ],
};
