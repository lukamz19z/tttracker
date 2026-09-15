"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export type TowerMaterialMember = {
  id?: string;
  tower_id: string;
  bundle_reference: string | null;
  drawing_number: string | null;
  mark_no: string;
  qty_per_tower: number | null;
  section: string | null;
  tower_segment: string | null;
};

type Props = {
  members: TowerMaterialMember[];
  segment: string;
  memberNumber: string;
  onSegmentChange: (segment: string) => void;
  onMemberNumberChange: (memberNumber: string) => void;
  onSelectMember: (member: TowerMaterialMember) => void;
  segmentLabel?: string;
  memberLabel?: string;
  memberPlaceholder?: string;
  disabled?: boolean;
};

function clean(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function memberSearchText(member: TowerMaterialMember) {
  return [
    member.mark_no,
    member.tower_segment,
    member.drawing_number,
    member.section,
    member.bundle_reference,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-500";

export default function TowerMemberFields({
  members,
  segment,
  memberNumber,
  onSegmentChange,
  onMemberNumberChange,
  onSelectMember,
  segmentLabel = "Tower segment",
  memberLabel = "Member number",
  memberPlaceholder = "Search tower members...",
  disabled = false,
}: Props) {
  const [memberOpen, setMemberOpen] = useState(false);

  const segmentOptions = useMemo(() => {
    const values = new Set<string>();

    for (const member of members) {
      const value = clean(member.tower_segment);
      if (value) values.add(value);
    }

    if (clean(segment)) values.add(clean(segment));

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [members, segment]);

  const visibleMembers = useMemo(() => {
    const query = clean(memberNumber).toLowerCase();
    const selectedSegment = clean(segment).toLowerCase();

    return members
      .filter((member) => {
        const memberSegment = clean(member.tower_segment).toLowerCase();

        if (selectedSegment && memberSegment !== selectedSegment) return false;
        if (!query) return true;

        return memberSearchText(member).includes(query);
      })
      .sort((a, b) =>
        clean(a.mark_no).localeCompare(clean(b.mark_no), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      )
      .slice(0, 20);
  }, [memberNumber, members, segment]);

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
          {segmentLabel}
        </span>
        <select
          value={segment}
          disabled={disabled}
          onChange={(event) => onSegmentChange(event.target.value)}
          className={inputClass}
        >
          <option value="">Select tower segment...</option>
          {segmentOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <div className="relative">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
            {memberLabel}
          </span>

          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={memberNumber}
              disabled={disabled}
              onFocus={() => {
                if (!disabled) setMemberOpen(true);
              }}
              onBlur={() =>
                window.setTimeout(() => setMemberOpen(false), 150)
              }
              onChange={(event) => {
                onMemberNumberChange(event.target.value);
                setMemberOpen(true);
              }}
              placeholder={memberPlaceholder}
              autoComplete="off"
              className={`${inputClass} pl-9`}
            />
          </div>
        </label>

        {memberOpen && !disabled ? (
          <div className="absolute z-50 mt-1 max-h-72 w-full min-w-[300px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            {members.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-500">
                No members are loaded for this tower.
              </div>
            ) : visibleMembers.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-500">
                No matching members
                {segment ? ` in ${segment}` : ""}.
              </div>
            ) : (
              visibleMembers.map((member) => (
                <button
                  key={
                    member.id ??
                    `${member.mark_no}-${member.tower_segment}-${member.bundle_reference}`
                  }
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelectMember(member);
                    setMemberOpen(false);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                >
                  <div className="text-sm font-bold text-slate-900">
                    {member.mark_no}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-4 text-slate-500">
                    {[
                      clean(member.tower_segment),
                      clean(member.drawing_number)
                        ? `Drawing ${clean(member.drawing_number)}`
                        : "",
                      clean(member.section),
                      clean(member.bundle_reference)
                        ? `Bundle ${clean(member.bundle_reference)}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                </button>
              ))
            )}
          </div>
        ) : null}

        {members.length > 0 ? (
          <div className="mt-1 text-[11px] text-slate-400">
            {segment
              ? `Searching ${members.filter((member) => clean(member.tower_segment) === clean(segment)).length} member(s) in ${segment}.`
              : `Search all ${members.length} member record(s), or select a segment first.`}
          </div>
        ) : null}
      </div>
    </>
  );
}
