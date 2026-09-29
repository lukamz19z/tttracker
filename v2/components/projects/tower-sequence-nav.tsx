import Link from "next/link";
import { ArrowLeft, ArrowRight, List } from "lucide-react";

import { tt } from "@/components/ui/tt-ui";

type TowerLink = {
  id: string;
  label: string;
};

type Props = {
  projectId: string;
  organisationId: string;
  previous: TowerLink | null;
  current: TowerLink;
  next: TowerLink | null;
};

export default function TowerSequenceNav({
  projectId,
  organisationId,
  previous,
  current,
  next,
}: Props) {
  const query = `organisation=${encodeURIComponent(
    organisationId,
  )}`;

  return (
    <div
      className={tt.card}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 10,
        padding: 10,
      }}
    >
      <div>
        {previous ? (
          <Link
            className={tt.button}
            href={`/workspace/projects/${projectId}/towers/${previous.id}?${query}`}
          >
            <ArrowLeft size={14} />
            {previous.label}
          </Link>
        ) : null}
      </div>

      <Link
        className={tt.button}
        href={`/workspace/projects/${projectId}/towers?${query}`}
      >
        <List size={14} />
        {current.label}
      </Link>

      <div style={{ justifySelf: "end" }}>
        {next ? (
          <Link
            className={tt.button}
            href={`/workspace/projects/${projectId}/towers/${next.id}?${query}`}
          >
            {next.label}
            <ArrowRight size={14} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
