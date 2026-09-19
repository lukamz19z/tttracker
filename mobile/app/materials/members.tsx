import { MaterialLiveSearch } from "@/components/materials/MaterialLiveSearch";

export default function Members() {
  return (
    <MaterialLiveSearch
      kind="member"
      title="Members"
      subtitle="Search member number, part number, drawing, bundle or segment without loading the full member register into the results list."
      placeholder="Member, PN, drawing, bundle, segment…"
    />
  );
}
