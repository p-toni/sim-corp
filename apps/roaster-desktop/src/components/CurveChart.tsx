import type { RoastEvent, TelemetryPoint } from "@sim-corp/schemas";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

interface CurveChartProps {
  telemetry: TelemetryPoint[];
  events: RoastEvent[];
}

const formatSeconds = (value: number): string => `${value}s`;

function eventElapsedSeconds(event: RoastEvent, telemetry: TelemetryPoint[]): number | null {
  const payloadElapsed = event.payload?.elapsedSeconds;
  if (typeof payloadElapsed === "number" && Number.isFinite(payloadElapsed)) {
    return payloadElapsed;
  }

  if (telemetry.length > 0) {
    const startTs = Date.parse(telemetry[0].ts);
    const eventTs = Date.parse(event.ts);
    if (Number.isFinite(startTs) && Number.isFinite(eventTs)) {
      const deltaSeconds = (eventTs - startTs) / 1000;
      return telemetry[0].elapsedSeconds + deltaSeconds;
    }
  }

  return null;
}

export function CurveChart({ telemetry, events }: CurveChartProps) {
  const data = telemetry.map((point) => ({
    time: point.elapsedSeconds,
    bt: point.btC ?? null,
    et: point.etC ?? null,
    ror: point.rorCPerMin ?? null
  }));

  const summary = `Telemetry: ${telemetry.length} · Events: ${events.length}`;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Roast Curves</h2>
        <span className="muted">{summary}</span>
      </div>
      {data.length === 0 ? (
        <div className="empty">Run a mission to see roast telemetry.</div>
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis
              dataKey="time"
              tickFormatter={formatSeconds}
              type="number"
              domain={["auto", "auto"]}
              label={{ value: "Elapsed (s)", position: "insideBottom", offset: -4 }}
            />
            <YAxis
              yAxisId="temp"
              domain={["auto", "auto"]}
              label={{ value: "Temp (°C)", angle: -90, position: "insideLeft" }}
            />
            <YAxis
              yAxisId="ror"
              orientation="right"
              domain={["auto", "auto"]}
              label={{ value: "RoR (°C/min)", angle: 90, position: "insideRight" }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [value, name.toUpperCase()]}
              labelFormatter={formatSeconds}
            />
            <Legend />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="bt"
              stroke="#2563eb"
              dot={false}
              name="BT"
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="et"
              stroke="#f97316"
              dot={false}
              name="ET"
            />
            <Line
              yAxisId="ror"
              type="monotone"
              dataKey="ror"
              stroke="#16a34a"
              dot={false}
              name="RoR"
            />
            {events.map((event, idx) => {
              const x = eventElapsedSeconds(event, telemetry);
              if (x === null) return null;
              return (
                <ReferenceLine
                  key={`${event.type}-${idx}`}
                  x={x}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  label={{ value: event.type, position: "top", fontSize: 10 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
