import { MaterialLiveSearch } from "@/components/materials/MaterialLiveSearch";

export default function MaterialSearch() {
  return (
    <MaterialLiveSearch
      kind="all"
      title="Search"
      subtitle="Fast live search across members, bundles and bolts. Cached matches remain available when offline."
      placeholder="Member, bundle, drawing, segment, bolt…"
      showKind
    />
  );
}
