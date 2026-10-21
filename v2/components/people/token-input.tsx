"use client";
import { useRef } from "react";
import { folderTokens, resolveTokens } from "@/lib/people/document-rules";
import { peopleLabel } from "@/lib/people/display";
import styles from "./people.module.css";
export function insertToken(
  value: string,
  token: string,
  start: number,
  end: number,
) {
  const text = `{${token}}`;
  return {
    value: value.slice(0, start) + text + value.slice(end),
    cursor: start + text.length,
  };
}
export function validateTemplate(value: string, folder = false) {
  return resolveTokens(
    value,
    Object.fromEntries(folderTokens.map((token) => [token, "preview"])),
    folder,
  );
}
const tokenGroups = {
  Person: [
    "person_id",
    "person_display_name",
    "first_name",
    "last_name",
    "employee_number",
    "relationship_type",
  ],
  Training: [
    "training_type",
    "category",
    "training_option",
    "issue_date",
    "expiry_date",
  ],
  Document: ["document_category", "document_type"],
  Project: ["project_code"],
  Date: ["year"],
};
export function TokenInput({
  value,
  onChange,
  tokens: allowedTokens,
}: {
  value: string;
  onChange: (next: string) => void;
  tokens?: readonly string[];
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className={styles.tokenControl}>
      <input
        ref={input}
        className="tt-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <select
        className="tt-input"
        aria-label="Insert token"
        value=""
        onChange={(e) => {
          const token = e.target.value;
          if (!token) return;
          const field = input.current;
          const result = insertToken(
            value,
            token,
            field?.selectionStart ?? value.length,
            field?.selectionEnd ?? value.length,
          );
          onChange(result.value);
          requestAnimationFrame(() => {
            field?.focus();
            field?.setSelectionRange(result.cursor, result.cursor);
          });
        }}
      >
        <option value="">+ Insert token</option>
        {Object.entries(allowedTokens ? { "Available tokens": allowedTokens } : tokenGroups).map(([group, tokens]) => (
          <optgroup key={group} label={group}>
            {tokens.map((token) => (
              <option key={token} value={token}>
                {peopleLabel(token)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </span>
  );
}
