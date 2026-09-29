"use client";

import {
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarRange,
  Gauge,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  Card,
  EmptyState,
  MetricCard,
  tt,
} from "@/components/ui/tt-ui";
import type {
  CrewPerformanceRow,
  ForecastingData,
  TrendPoint,
} from "@/lib/projects/forecasting";

type Props = {
  data: ForecastingData;
  organisationId: string;
  projectId: string;
  initialStartDate: string;
  initialEndDate: string;
};

function fmt(
  value: number | null,
  digits = 2,
) {
  return value === null ||
    Number.isNaN(value)
    ? "-"
    : value.toFixed(digits);
}

export default function ForecastingClient({
  data,
  organisationId,
  projectId,
  initialStartDate,
  initialEndDate,
}: Props) {
  const router = useRouter();

  const [startDate, setStartDate] =
    useState(initialStartDate);
  const [endDate, setEndDate] =
    useState(initialEndDate);

  const maxCrewMh = useMemo(() => {
    const values = data.crews
      .map(
        (row) =>
          row.productionMhPerTonne,
      )
      .filter(
        (value): value is number =>
          value !== null,
      );

    return Math.max(1, ...values);
  }, [data.crews]);

  function applyDates() {
    const params =
      new URLSearchParams();

    params.set(
      "organisation",
      organisationId,
    );

    if (startDate) {
      params.set(
        "start",
        startDate,
      );
    }

    if (endDate) {
      params.set("end", endDate);
    }

    router.push(
      `/workspace/projects/${projectId}/forecasting?${params.toString()}`,
    );
  }

  return (
    <div className={tt.stack}>
      <div className={tt.metricGrid}>
        <MetricCard
          icon={<Gauge size={18} />}
          label="Project raw MH/t"
          value={fmt(
            data.projectRawMhPerTonne,
          )}
        />

        <MetricCard
          icon={<TrendingUp size={18} />}
          label="Production MH/t"
          value={fmt(
            data.projectProductionMhPerTonne,
          )}
        />

        <MetricCard
          icon={<CalendarRange size={18} />}
          label="Avg raw hrs/day"
          value={fmt(
            data.projectAverageDailyRawHours,
            1,
          )}
        />

        <MetricCard
          icon={<Users size={18} />}
          label="Crews with data"
          value={data.crews.length}
        />
      </div>

      <Card>
        <div className={tt.toolbar}>
          <div>
            <h2 className={tt.cardTitle}>
              Comparison period
            </h2>
            <p className={tt.cardDescription}>
              Use the same page to compare swings, months or specific production periods.
            </p>
          </div>

          <div className={tt.actions}>
            <label className={tt.field}>
              <span className={tt.label}>
                From
              </span>
              <input
                type="date"
                className="tt-input"
                value={startDate}
                onChange={(event) =>
                  setStartDate(
                    event.target.value,
                  )
                }
              />
            </label>

            <label className={tt.field}>
              <span className={tt.label}>
                To
              </span>
              <input
                type="date"
                className="tt-input"
                value={endDate}
                onChange={(event) =>
                  setEndDate(
                    event.target.value,
                  )
                }
              />
            </label>

            <button
              type="button"
              className={`${tt.button} ${tt.buttonPrimary}`}
              onClick={applyDates}
              style={{
                alignSelf: "flex-end",
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </Card>

      {!data.dataAvailable ? (
        <div
          className={`${tt.notice} ${tt.noticeInfo}`}
        >
          Forecasting is ready, but there are no production actuals for this period yet. As Daily Dockets feed the production-actuals layer, crew comparisons and tower forecasts will populate automatically.
        </div>
      ) : null}

      <Card>
        <h2 className={tt.cardTitle}>
          Crew comparison
        </h2>
        <p className={tt.cardDescription}>
          Compare crews from measured production output. This is not a subjective ranking.
        </p>

        <div
          style={{
            marginTop: 18,
            border: "1px solid #1e293b",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {data.crews.map((crew) => (
            <CrewBar
              key={crew.crew}
              crew={crew}
              maxMh={maxCrewMh}
            />
          ))}

          {data.crews.length === 0 ? (
            <div style={{ padding: 16 }}>
              <EmptyState title="No crew data">
                No matching production data exists for the selected period.
              </EmptyState>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <BarChart3
            size={19}
            style={{ color: "#7dd3fc" }}
          />
          <div>
            <h2 className={tt.cardTitle}>
              Performance trend
            </h2>
            <p className={tt.cardDescription}>
              Raw and production MH/t over time from actual project data.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <TrendChart rows={data.trends} />
        </div>
      </Card>

      <Card padded={false}>
        <div className={tt.cardHeader}>
          <div>
            <h2 className={tt.cardTitle}>
              Crew metrics
            </h2>
            <p className={tt.cardDescription}>
              Numerical comparison for the selected period.
            </p>
          </div>
        </div>

        <div
          className={tt.tableWrap}
          style={{
            border: 0,
            borderRadius: 0,
          }}
        >
          <table className={tt.table}>
            <thead>
              <tr>
                <th>Crew</th>
                <th>Dockets</th>
                <th>Towers</th>
                <th>Completed</th>
                <th>Raw MH/t</th>
                <th>Prod MH/t</th>
                <th>t/prod hr</th>
                <th>Tonnes</th>
              </tr>
            </thead>

            <tbody>
              {data.crews.map((crew) => (
                <tr key={crew.crew}>
                  <td
                    style={{
                      color: "#f8fafc",
                      fontWeight: 800,
                    }}
                  >
                    {crew.crew}
                  </td>
                  <td>{crew.docketCount}</td>
                  <td>{crew.towersTouched}</td>
                  <td>{crew.completedTowers}</td>
                  <td>
                    {fmt(
                      crew.rawMhPerTonne,
                    )}
                  </td>
                  <td
                    style={{
                      color: "#f8fafc",
                      fontWeight: 800,
                    }}
                  >
                    {fmt(
                      crew.productionMhPerTonne,
                    )}
                  </td>
                  <td>
                    {fmt(
                      crew.tonnesPerProductionHour,
                      3,
                    )}
                  </td>
                  <td>
                    {fmt(
                      crew.productionTonnes,
                      1,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padded={false}>
        <div className={tt.cardHeader}>
          <div>
            <h2 className={tt.cardTitle}>
              Tower forecast
            </h2>
            <p className={tt.cardDescription}>
              Remaining effort uses tower-type actuals where possible and falls back to project actuals.
            </p>
          </div>
        </div>

        <div
          className={tt.tableWrap}
          style={{
            border: 0,
            borderRadius: 0,
          }}
        >
          <table className={tt.table}>
            <thead>
              <tr>
                <th>Tower</th>
                <th>Type</th>
                <th>Progress</th>
                <th>Remaining t</th>
                <th>Benchmark</th>
                <th>Raw hrs</th>
                <th>Days</th>
                <th>Confidence</th>
              </tr>
            </thead>

            <tbody>
              {data.forecasts.map(
                (row) => (
                  <tr key={row.towerId}>
                    <td
                      style={{
                        color: "#f8fafc",
                        fontWeight: 800,
                      }}
                    >
                      {row.towerIdentifier}
                    </td>
                    <td>{row.towerType}</td>
                    <td>
                      {fmt(row.progress, 0)}%
                    </td>
                    <td>
                      {fmt(
                        row.remainingTonnes,
                        1,
                      )}
                    </td>
                    <td>{row.benchmark}</td>
                    <td>
                      {fmt(
                        row.forecastRawHours,
                        1,
                      )}
                    </td>
                    <td
                      style={{
                        color: "#f8fafc",
                        fontWeight: 800,
                      }}
                    >
                      {fmt(
                        row.forecastDays,
                        1,
                      )}
                    </td>
                    <td>{row.confidence}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CrewBar({
  crew,
  maxMh,
}: {
  crew: CrewPerformanceRow;
  maxMh: number;
}) {
  const value =
    crew.productionMhPerTonne ?? 0;

  const width =
    maxMh > 0
      ? Math.min(
          100,
          (value / maxMh) * 100,
        )
      : 0;

  return (
    <div className={tt.barRow}>
      <div>
        <div
          style={{
            color: "#f8fafc",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {crew.crew}
        </div>
        <div className={tt.secondary}>
          {crew.towersTouched} towers ·{" "}
          {crew.docketCount} dockets
        </div>
      </div>

      <div className={tt.barTrack}>
        <div
          className={tt.barFill}
          style={{
            width: `${width}%`,
          }}
        />
      </div>

      <div
        style={{
          color: "#f8fafc",
          fontSize: 13,
          fontWeight: 850,
          textAlign: "right",
        }}
      >
        {fmt(
          crew.productionMhPerTonne,
        )}{" "}
        MH/t
      </div>
    </div>
  );
}

function TrendChart({
  rows,
}: {
  rows: TrendPoint[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyState title="No trend data">
        No production trend exists for this period yet.
      </EmptyState>
    );
  }

  const visible = rows.slice(-30);

  const values =
    visible.flatMap((row) =>
      [
        row.rawMhPerTonne,
        row.productionMhPerTonne,
      ].filter(
        (value): value is number =>
          value !== null,
      ),
    );

  const max = Math.max(1, ...values);

  const width = Math.max(
    760,
    visible.length * 55,
  );
  const height = 280;
  const left = 52;
  const top = 22;
  const bottom = 46;
  const right = 20;
  const plotWidth =
    width - left - right;
  const plotHeight =
    height - top - bottom;

  const x = (index: number) =>
    visible.length <= 1
      ? left + plotWidth / 2
      : left +
        (index /
          (visible.length - 1)) *
          plotWidth;

  const y = (
    value: number | null,
  ) =>
    value === null
      ? null
      : top +
        plotHeight -
        (value / max) *
          plotHeight;

  const line = (
    key:
      | "rawMhPerTonne"
      | "productionMhPerTonne",
  ) =>
    visible
      .map((row, index) => {
        const pointY = y(row[key]);

        return pointY === null
          ? null
          : `${x(index)},${pointY}`;
      })
      .filter(
        (value): value is string =>
          Boolean(value),
      )
      .join(" ");

  return (
    <div className={tt.chartBox}>
      <svg
        width={width}
        height={height}
        style={{ display: "block" }}
      >
        <line
          x1={left}
          y1={top + plotHeight}
          x2={width - right}
          y2={top + plotHeight}
          stroke="#334155"
        />

        <polyline
          points={line(
            "rawMhPerTonne",
          )}
          fill="none"
          stroke="#64748b"
          strokeWidth="2.5"
        />

        <polyline
          points={line(
            "productionMhPerTonne",
          )}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="3"
        />

        {visible.map((row, index) => {
          const pointY = y(
            row.productionMhPerTonne,
          );

          return (
            <g key={row.date}>
              {pointY !== null ? (
                <circle
                  cx={x(index)}
                  cy={pointY}
                  r="4"
                  fill="#38bdf8"
                />
              ) : null}

              <text
                x={x(index)}
                y={height - 16}
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
              >
                {row.date.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
