import { MaterialLiveSearch } from "@/components/materials/MaterialLiveSearch";

export default function Members() {
  return (
    <MaterialLiveSearch
      kind="member"
      title="Members"
      subtitle="Choose a tower and search field, then search only that part of the member register."
      placeholder="Search selected member field…"
    />
  );
}
