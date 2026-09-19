import { MaterialLiveSearch } from "@/components/materials/MaterialLiveSearch";

export default function MaterialSearch() {
  return (
    <MaterialLiveSearch
      kind="all"
      title="Search"
      subtitle="Choose a tower and material type first, then search the relevant register. Cached matches remain available offline."
      placeholder="Search selected material register…"
      showKind
    />
  );
}
