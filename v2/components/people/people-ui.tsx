"use client";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { formatPeopleDate, parsePeopleDate } from "@/lib/people/dates";
import styles from "./people.module.css";
export function BackLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      className={styles.back}
      href={href}
      onClick={(e) => {
        if (onNavigate) {
          e.preventDefault();
          onNavigate();
        }
      }}
    >
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
export function PeopleDateInput({
  value,
  defaultValue = "",
  onChange,
  name,
  withTime = false,
  required = false,
  disabled = false,
  id,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  withTime?: boolean;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const initial = value ?? defaultValue;
  const [draft, setDraft] = useState({
    emitted: initial,
    raw: initial ? formatPeopleDate(initial, withTime) : "",
  });
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const ref = useRef<HTMLInputElement>(null);
  const canonical = value ?? draft.emitted;
  const text =
    value === undefined || value === draft.emitted
      ? draft.raw
      : value
        ? formatPeopleDate(value, withTime)
        : "";
  const invalid = !!text && !parsePeopleDate(text, withTime);
  useEffect(() => {
    ref.current?.setCustomValidity(
      invalid
        ? `Enter a valid ${withTime ? "date and time" : "date"} (${withTime ? "DD/MM/YYYY HH:mm" : "DD/MM/YYYY"}).`
        : "",
    );
  }, [invalid, withTime]);
  const select = (raw: string) => {
    const valid = parsePeopleDate(raw, withTime);
    setDraft({ raw, emitted: valid ?? "" });
    onChange?.(valid ?? "");
  };
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  return (
    <span className={styles.dateControl}>
      <span className={styles.dateRow}>
        <input
          ref={ref}
          id={inputId}
          className="tt-input"
          type="text"
          value={text}
          required={required}
          disabled={disabled}
          placeholder={withTime ? "DD/MM/YYYY HH:mm" : "DD/MM/YYYY"}
          aria-invalid={invalid}
          onChange={(e) => select(e.target.value)}
        />
        <button
          type="button"
          className="tt-button-subtle"
          aria-label="Open calendar"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            if (!open && canonical) {
              const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(canonical);
              if (match)
                setMonth(new Date(Number(match[1]), Number(match[2]) - 1, 1));
            }
            setOpen(!open);
          }}
        >
          <CalendarDays size={17} />
        </button>
      </span>
      {name && <input type="hidden" name={name} value={canonical} />}{" "}
      {invalid && (
        <small role="alert">
          Enter a valid {withTime ? "date and time" : "date"}.
        </small>
      )}
      {open && (
        <span className={styles.calendar}>
          <span className={styles.toolbar}>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft size={16} />
            </button>
            <strong>
              {month.toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight size={16} />
            </button>
          </span>
          <span className={styles.calendarGrid}>
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <small key={d}>{d}</small>
            ))}
            {Array.from({ length: offset }, (_, n) => (
              <span key={`space-${n}`} />
            ))}
            {Array.from({ length: count }, (_, n) => {
              const day = n + 1;
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              return (
                <button
                  type="button"
                  key={day}
                  aria-label={formatPeopleDate(date.toISOString())}
                  onClick={() => {
                    select(
                      formatPeopleDate(date.toISOString()) +
                        (withTime
                          ? ` ${/ \d{2}:\d{2}$/.exec(text)?.[0].trim() ?? "09:00"}`
                          : ""),
                    );
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </span>
          <button
            type="button"
            className="tt-button-subtle"
            onClick={() => setOpen(false)}
          >
            Close calendar
          </button>
        </span>
      )}
    </span>
  );
}
