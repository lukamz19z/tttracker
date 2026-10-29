import Link from "next/link";
import { ladderDetailHref, type LadderReference } from "@/lib/assets/ladders";

export function LadderReplacementLinks({ supersedes, supersededBy }: {
  supersedes?: LadderReference | null;
  supersededBy?: LadderReference | null;
}) {
  if (!supersedes && !supersededBy) return null;
  return <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
    {supersedes ? <p>Supersedes: <Link className="font-bold text-blue-700 hover:underline" href={ladderDetailHref(supersedes.id)}>{supersedes.ladder_number}</Link></p> : null}
    {supersededBy ? <p>Superseded by: <Link className="font-bold text-blue-700 hover:underline" href={ladderDetailHref(supersededBy.id)}>{supersededBy.ladder_number}</Link></p> : null}
  </div>;
}
