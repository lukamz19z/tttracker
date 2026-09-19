import { MaterialLiveSearch } from "@/components/materials/MaterialLiveSearch";

export default function Bolts() {
  return (
    <MaterialLiveSearch
      kind="bolt"
      title="Bolts"
      subtitle="Search the live project bolt register by diameter, length, DN/SN or segment."
      placeholder="Diameter, length, DN/SN, segment…"
    />
  );
}
