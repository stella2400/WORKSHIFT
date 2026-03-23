import { DashboardResponse, WorkStationEntry, buildShiftMap, buildStationMap } from "../types";

type Props = {
  dashboard: DashboardResponse;
  userName: string;
};

const MONTHS_IT = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const DAYS_IT = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];

export function TodayBanner({ dashboard, userName }: Props) {
  const { shifts, definitions, stations, station_definitions } = dashboard;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  // All from config
  const shiftDefs = buildShiftMap(definitions);
  const stationDefMap = buildStationMap(station_definitions);

  const todayShift = shifts.find(s => s.shift_date === todayStr);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,"0")}-${String(tomorrow.getDate()).padStart(2,"0")}`;
  const tomorrowShift = shifts.find(s => s.shift_date === tomorrowStr);

  // Station for today
  const todayStation = stations.find(s => s.assigned_date === todayStr);

  const dayName = DAYS_IT[today.getDay()];
  const dateLabel = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${today.getDate()} ${MONTHS_IT[today.getMonth()]}`;

  const todayDef = todayShift ? shiftDefs[todayShift.shift_code] : null;
  const color = todayDef?.color || "#475569";
  const isOff = todayDef?.category === "off";

  const tomorrowDef = tomorrowShift ? shiftDefs[tomorrowShift.shift_code] : null;
  const tomorrowColor = tomorrowDef?.color || "#475569";

  function stationLabel(entry: WorkStationEntry): string {
    return entry.station_label || stationDefMap[entry.station_code]?.label || entry.station_code;
  }
  function stationColor(entry: WorkStationEntry): string {
    return stationDefMap[entry.station_code]?.color || "#6ee7b7";
  }

  return (
    <div className="card today-banner">
      {/* Shift badge — width auto to fit code length */}
      <div style={{
        minWidth: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: `${color}22`, border: `2px solid ${color}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 12px",
        fontSize: todayShift && todayShift.shift_code.length > 3 ? 14 : 20,
        fontWeight: 800, fontFamily: "var(--font-display)",
        color, whiteSpace: "nowrap",
      }}>
        {todayShift ? todayShift.shift_code : "—"}
      </div>

      {/* Main info */}
      <div style={{ flex: 1 }}>
        <div className="label" style={{ marginBottom: 4 }}>{dateLabel}</div>
        {todayShift ? (
          <>
            <div className="display" style={{ fontSize: 28, color, lineHeight: 1.1 }}>
              {todayShift.shift_label}
            </div>
            {/* Show effective time if modified, otherwise planned from config */}
            {(() => {
              // Priorità: orario effettivo > orario turno > orario definizione
              const displayStart = todayShift?.actual_time_start || todayShift?.time_start || todayDef?.time_start;
              const displayEnd   = todayShift?.actual_time_end   || todayShift?.time_end   || todayDef?.time_end;
              const isActual     = !!(todayShift?.actual_time_start);
              if (!displayStart) return null;
              return (
                <div style={{ fontSize: 12, marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
                  {isActual ? (
                    <span style={{ padding: "2px 9px", borderRadius: 99, background: `${color}20`, color, border: `1px solid ${color}50`, fontWeight: 600, fontSize: 12 }}>
                      🕐 {displayStart.slice(0,5)}–{displayEnd?.slice(0,5)}
                    </span>
                  ) : (
                    <span className="muted">
                      🕐 {displayStart.slice(0,5)}–{displayEnd?.slice(0,5)}
                    </span>
                  )}
                </div>
              );
            })()}
            {/* Station — from config */}
            {todayStation && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>📍</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: stationColor(todayStation) }}>
                  {todayStation.station_code}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>{stationLabel(todayStation)}</span>
              </div>
            )}
            {isOff && (
              <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>Giornata di riposo 🌿</div>
            )}
          </>
        ) : (
          <div className="display" style={{ fontSize: 22, color: "var(--text-2)", lineHeight: 1.1 }}>
            Nessun turno registrato
          </div>
        )}
      </div>

      {/* Tomorrow */}
      {tomorrowShift && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="label" style={{ marginBottom: 4 }}>Domani</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: tomorrowColor }}/>
            <span style={{ fontWeight: 600, color: tomorrowColor }}>{tomorrowShift.shift_code}</span>
            <span className="muted" style={{ fontSize: 13 }}>{tomorrowShift.shift_label}</span>
          </div>
          {tomorrowDef?.time_start && (
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              {tomorrowDef.time_start.slice(0,5)}–{tomorrowDef.time_end?.slice(0,5)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
