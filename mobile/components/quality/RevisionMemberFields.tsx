
import { ChevronDown } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { QualitySelector } from "@/components/quality/QualitySelector";
import type { QualityMemberCatalogRow } from "@/lib/api/quality";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function RevisionMemberFields({
  members,
  segment,
  memberNumber,
  drawingNumber,
  onSegmentChange,
  onSelectMember,
}: {
  members: QualityMemberCatalogRow[];
  segment: string;
  memberNumber: string;
  drawingNumber: string;
  onSegmentChange: (
    segment: string,
    keepCurrentMember: boolean,
  ) => void;
  onSelectMember: (
    member: QualityMemberCatalogRow,
  ) => void;
}) {
  const [segmentOpen, setSegmentOpen] =
    useState(false);
  const [memberOpen, setMemberOpen] =
    useState(false);

  const segmentOptions = useMemo(() => {
    const values = new Set<string>();

    for (const member of members) {
      const value = clean(member.towerSegment);
      if (value) values.add(value);
    }

    if (clean(segment)) {
      values.add(clean(segment));
    }

    return Array.from(values)
      .sort(naturalSort)
      .map((value) => ({
        id: value,
        label: value,
      }));
  }, [members, segment]);

  const membersInSegment = useMemo(() => {
    const selectedSegment =
      clean(segment).toLowerCase();

    return members
      .filter((member) => {
        if (!selectedSegment) return true;

        return (
          clean(member.towerSegment).toLowerCase() ===
          selectedSegment
        );
      })
      .sort((a, b) =>
        naturalSort(
          clean(a.memberNumber),
          clean(b.memberNumber),
        ),
      );
  }, [members, segment]);

  const memberOptions = useMemo(
    () =>
      membersInSegment.map((member) => ({
        id: member.id,
        label: clean(member.memberNumber) || "Member",
        subtitle: [
          clean(member.towerSegment),
          clean(member.drawingNumber)
            ? `Drawing ${clean(member.drawingNumber)}`
            : "",
          clean(member.section),
          clean(member.bundleReference)
            ? `Bundle ${clean(member.bundleReference)}`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    [membersInSegment],
  );

  function chooseSegment(value: string) {
    const currentMemberStillMatches =
      !clean(memberNumber) ||
      members.some(
        (member) =>
          clean(member.memberNumber) ===
            clean(memberNumber) &&
          clean(member.towerSegment) ===
            clean(value),
      );

    onSegmentChange(
      value,
      currentMemberStillMatches,
    );
  }

  function selectMember(optionId: string) {
    const member = members.find(
      (row) => row.id === optionId,
    );

    if (!member) return;
    onSelectMember(member);
  }

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.label}>
          Tower segment
        </Text>

        <Pressable
          style={styles.selector}
          onPress={() => setSegmentOpen(true)}
        >
          <View style={styles.selectorCopy}>
            <Text
              style={[
                styles.selectorTitle,
                !segment && styles.placeholder,
              ]}
            >
              {segment || "Select tower segment…"}
            </Text>

            <Text style={styles.selectorSub}>
              {members.length
                ? `${segmentOptions.length} segment${segmentOptions.length === 1 ? "" : "s"} available`
                : "No tower members loaded"}
            </Text>
          </View>

          <ChevronDown
            size={18}
            color="#64748b"
          />
        </Pressable>
      </View>

      <View>
        <Text style={styles.label}>
          Member number
        </Text>

        <Pressable
          style={styles.selector}
          onPress={() => setMemberOpen(true)}
        >
          <View style={styles.selectorCopy}>
            <Text
              style={[
                styles.selectorTitle,
                !memberNumber && styles.placeholder,
              ]}
            >
              {memberNumber ||
                "Search / select member…"}
            </Text>

            <Text style={styles.selectorSub}>
              {segment
                ? `${membersInSegment.length} member${membersInSegment.length === 1 ? "" : "s"} in ${segment}`
                : `${membersInSegment.length} member${membersInSegment.length === 1 ? "" : "s"} across this tower`}
            </Text>
          </View>

          <ChevronDown
            size={18}
            color="#64748b"
          />
        </Pressable>
      </View>

      <View>
        <Text style={styles.label}>
          Drawing
        </Text>

        <View style={styles.readOnly}>
          <Text
            style={[
              styles.readOnlyText,
              !drawingNumber && styles.placeholder,
            ]}
          >
            {drawingNumber ||
              "Auto-filled from selected member"}
          </Text>
        </View>
      </View>

      <QualitySelector
        visible={segmentOpen}
        title="Tower Segment"
        options={[
          {
            id: "__all__",
            label: "All segments",
            subtitle:
              "Search every member loaded for this tower",
          },
          ...segmentOptions,
        ]}
        onClose={() => setSegmentOpen(false)}
        onSelect={(option) => {
          chooseSegment(
            option.id === "__all__"
              ? ""
              : option.id,
          );
          setSegmentOpen(false);
        }}
      />

      <QualitySelector
        visible={memberOpen}
        title={
          segment
            ? `Member Number · ${segment}`
            : "Member Number"
        }
        options={memberOptions}
        onClose={() => setMemberOpen(false)}
        onSelect={(option) => {
          selectMember(option.id);
          setMemberOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  label: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  selector: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selectorCopy: {
    flex: 1,
  },
  selectorTitle: {
    color: "#0f172a",
    fontWeight: "800",
  },
  selectorSub: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 3,
  },
  placeholder: {
    color: "#94a3b8",
  },
  readOnly: {
    minHeight: 46,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
  },
  readOnlyText: {
    color: "#334155",
    fontWeight: "700",
  },
});
