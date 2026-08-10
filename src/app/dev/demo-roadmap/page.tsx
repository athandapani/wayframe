// Started as a dev-only visual QA page for the official demo dataset
// (wayframe issue #10). Un-gated (wayframe#38 item 6 / #39): it's the only
// "see it working" link a first-time visitor has anywhere in the product —
// the real `/` entry page has no other way to show the tool in action
// before someone brings their own data — so it now doubles as the public
// "see a full example" route, linked from the entry page and HelpPanel.
import { DemoRoadmapView } from "./DemoRoadmapView";

export default function DemoRoadmapDevPreview() {
  return <DemoRoadmapView />;
}
