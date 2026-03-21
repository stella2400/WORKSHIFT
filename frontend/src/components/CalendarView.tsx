import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, Users } from "lucide-react";
import { api } from "../api/client";
import { ColleagueRead, DashboardResponse, Shift, WorkStationEntry, buildShiftMap } from "../types";

type Props = { dashboard: DashboardResponse; sideDetail?: boolean };

const WEEKDAYS = ["L","M","M","G","V","S","D"];
const MONTHS_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

function firstWeekday(y: number, m: number) { return (new Date(y, m-1, 1).getDay() + 6) % 7; }

export function CalendarView({ dashboard, sideDetail=false }: Props) {
  const { shifts, definitions, stations, station_definitions } = dashboard;

  // All lookups derived from configurations — no hardcoded values
  const shiftDefs = useMemo(() => buildShiftMap(definitions), [definitions]);
  const stationDefMap = useMemo(() => Object.fromEntries(station_definitions.map(d => [d.code, d])), [station_definitions]);

  // date -> Shift
  const shiftMap = useMemo(() => {
    const m: Record<string, Shift> = {};
    shifts.forEach(s => { m[s.shift_date] = s; });
    return m;
  }, [shifts]);

  // date -> WorkStationEntry
  const stationByDate = useMemo(() => {
    const m: Record<string, WorkStationEntry> = {};
    stations.forEach(s => { if (s.assigned_date) m[s.assigned_date] = s; });
    return m;
  }, [stations]);

  // Available months from shift data
  const months = useMemo(() => {
    const s = new Set<string>();
    shifts.forEach(sh => { const [y,m] = sh.shift_date.split("-"); s.add(`${y}-${m}`); });
    const sorted = Array.from(s).sort();
    if (!sorted.length) { const n = new Date(); return [`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`]; }
    return sorted;
  }, [shifts]);

  const [idx, setIdx] = useState(() => months.length - 1);
  const cur = months[idx] ?? months[0];
  const [year, month] = cur.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const fw = firstWeekday(year, month);
  const today = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState<string | null>(null);
  const [colleagues, setColleagues] = useState<ColleagueRead[]>([]);
  const [colleaguesLoading, setColleaguesLoading] = useState(false);

  async function selectDay(dateStr: string, shift: Shift) {
    setSelected(dateStr); setColleagues([]); setColleaguesLoading(true);
    try {
      const { data } = await api.get<ColleagueRead[]>("/shifts/colleagues", { params: { shift_date: dateStr, shift_code: shift.shift_code } });
      setColleagues(data);
    } catch { /**/ } finally { setColleaguesLoading(false); }
  }

  const cells: (null | number)[] = [...Array(fw).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedShift = selected ? shiftMap[selected] : null;
  const selectedStation = selected ? stationByDate[selected] : null;

  function shiftColor(code: string): string {
    return shiftDefs[code]?.color || "#475569";
  }
  function stationLabel(entry: WorkStationEntry): string {
    return entry.station_label || stationDefMap[entry.station_code]?.label || entry.station_code;
  }
  function stationColor(entry: WorkStationEntry): string {
    return stationDefMap[entry.station_code]?.color || "#6ee7b7";
  }

  const CalendarGrid = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 className="heading" style={{ fontSize: 16 }}>{MONTHS_IT[month-1]} {year}</h2>
          <div style={{ display: "flex", gap: 3 }}>
            <button className="btn btn-ghost btn-sm btn-icon" style={{ padding: 4 }} onClick={() => setIdx(i => Math.max(0, i-1))} disabled={idx===0}><ChevronLeft size={13}/></button>
            <button className="btn btn-ghost btn-sm btn-icon" style={{ padding: 4 }} onClick={() => setIdx(i => Math.min(months.length-1, i+1))} disabled={idx===months.length-1}><ChevronRight size={13}/></button>
          </div>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="cal-grid" style={{ gap: 2 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={`wd-${i}`} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "var(--text-3)", padding: "2px 0", textTransform: "uppercase" }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="cal-grid" style={{ gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} style={{ aspectRatio: "1" }}/>;
          const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const shift = shiftMap[dateStr];
          const station = stationByDate[dateStr];
          const color = shift ? shiftColor(shift.shift_code) : undefined;
          const isToday = dateStr === today;
          const isSel = dateStr === selected;
          const hasOt = (shift?.overtime_hours ?? 0) > 0;
          return (
            <div key={dateStr}
              onClick={() => shift && selectDay(dateStr, shift)}
              title={shift ? `${shift.shift_label}${station ? " · " + stationLabel(station) : ""}` : ""}
              style={{
                aspectRatio: "1", borderRadius: 7, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                background: shift ? `${color}20` : "rgba(255,255,255,.02)",
                border: isSel ? `2px solid ${color}` : isToday ? `2px solid var(--accent)` : `1px solid ${shift ? `${color}35` : "transparent"}`,
                cursor: shift ? "pointer" : "default", transition: "transform .1s", position: "relative",
              }}
              onMouseEnter={e => { if (shift) (e.currentTarget as HTMLElement).style.transform = "scale(1.07)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}>
              <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1, color: shift ? color : "var(--text-3)" }}>{day}</span>
              {shift && <span style={{ fontSize: 8, fontWeight: 700, color, marginTop: 1, lineHeight: 1 }}>{shift.shift_code}</span>}
              {/* Show station code instead of 0 — only if shift exists and station exists */}
              {shift && station && (
                <span style={{ fontSize: 7, color: stationColor(station), marginTop: 1, lineHeight: 1, fontWeight: 600 }}>{station.station_code}</span>
              )}
              {hasOt && <span style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, borderRadius: "50%", background: "var(--warning)" }}/>}
              {shift?.actual_time_start && (
                <span style={{ position: "absolute", bottom: 2, right: 3, fontSize: 7, lineHeight: 1, color: color, opacity: 0.75, pointerEvents: "none", userSelect: "none" }}>✎</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend — from shift definitions only */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", paddingTop: 6, borderTop: "1px solid var(--border)" }}>
        {definitions.map(d => (
          <div key={d.code} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }}/>
            <span style={{ color: "var(--text-2)" }}>
              {d.code}
              {d.time_start && <span style={{ color: "var(--text-3)", marginLeft: 2 }}>{d.time_start.slice(0,5)}</span>}
            </span>
          </div>
        ))}
        {hasOtShifts() && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--warning)" }}/>
            <span style={{ color: "var(--text-2)" }}>Straord.</span>
          </div>
        )}
      </div>
    </div>
  );

  function hasOtShifts() { return shifts.some(s => (s.overtime_hours ?? 0) > 0); }

  const DetailPanel = selectedShift && selected ? (
    <div className="fade-in" style={{ padding: "14px 16px", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,.04)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: `${shiftColor(selectedShift.shift_code)}25`,
            border: `2px solid ${shiftColor(selectedShift.shift_code)}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16,
            color: shiftColor(selectedShift.shift_code), flexShrink: 0,
          }}>
            {selectedShift.shift_code}
          </div>
          <div>
            <div className="heading" style={{ fontSize: 15 }}>{selectedShift.shift_label}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {new Date(selected+"T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
        </div>
        {sideDetail && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSelected(null)}><X size={13}/></button>}
      </div>

      {/* Shift info badges — se orario effettivo presente mostra solo quello, altrimenti pianificato */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {selectedShift.actual_time_start ? (
          /* Orario effettivo modificato — badge colorato con colore turno */
          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 99, background: `${shiftColor(selectedShift.shift_code)}25`, color: shiftColor(selectedShift.shift_code), border: `1.5px solid ${shiftColor(selectedShift.shift_code)}60`, fontWeight: 600 }}>
            🕐 {selectedShift.actual_time_start.slice(0,5)}–{selectedShift.actual_time_end?.slice(0,5)}
          </span>
        ) : selectedShift.time_start ? (
          /* Orario pianificato — testo muted */
          <span className="muted" style={{ fontSize: 11 }}>
            🕐 {selectedShift.time_start.slice(0,5)}–{selectedShift.time_end?.slice(0,5)}
          </span>
        ) : null}
        {(selectedShift.hours_worked ?? 0) > 0 && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: `${shiftColor(selectedShift.shift_code)}20`, color: shiftColor(selectedShift.shift_code), border: `1px solid ${shiftColor(selectedShift.shift_code)}50` }}>
            {selectedShift.hours_worked}h
          </span>
        )}
        {(selectedShift.overtime_hours ?? 0) > 0 && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: "rgba(251,191,36,.15)", color: "var(--warning)", border: "1px solid rgba(251,191,36,.3)" }}>
            +{selectedShift.overtime_hours}h straord.
          </span>
        )}
      </div>

      {/* Station for this user — from station configuration */}
      {selectedStation && (
        <div style={{ marginBottom: 10, padding: "6px 10px", borderRadius: 8, background: `${stationColor(selectedStation)}15`, border: `1px solid ${stationColor(selectedStation)}35`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📍</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: stationColor(selectedStation) }}>{selectedStation.station_code}</div>
            <div className="muted" style={{ fontSize: 11 }}>{stationLabel(selectedStation)}</div>
          </div>
        </div>
      )}

      {/* Colleagues */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Users size={12} color="var(--text-3)"/>
          <div className="label" style={{ fontSize: 9 }}>Colleghi con lo stesso turno</div>
        </div>
        {colleaguesLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 10 }}><span className="spinner"/></div>
        ) : colleagues.length === 0 ? (
          <div className="muted" style={{ fontSize: 11 }}>Nessun collega con lo stesso turno</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {colleagues.map(c => {
              const cColor = shiftColor(c.shift_code);
              const cStation = c.station_name ? (stationDefMap[c.station_name]?.label || c.station_name) : null;
              const cStationColor = c.station_name ? (stationDefMap[c.station_name]?.color || "#6ee7b7") : "#6ee7b7";
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,.03)", border: "1px solid var(--border)" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: `${cColor}22`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 9, color: cColor, flexShrink: 0 }}>{c.shift_code}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{c.full_name}</div>
                    <div className="muted" style={{ fontSize: 10 }}>{c.employee_code}</div>
                  </div>
                  {cStation && (
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 99, background: `${cStationColor}20`, color: cStationColor, border: `1px solid ${cStationColor}40` }}>
                      📍 {cStation}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  ) : null;

  if (sideDetail) {
    return (
      <div className="cal-side-layout">
        <div className="card card-pad">{CalendarGrid}</div>
        <div>
          {DetailPanel ?? (
            <div style={{ padding: "16px 14px", borderRadius: "var(--radius-lg)", background: "rgba(255,255,255,.03)", border: "1px solid var(--border)", color: "var(--text-3)", fontSize: 12, textAlign: "center" }}>
              Clicca su un giorno per i dettagli
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card card-pad">{CalendarGrid}</div>
      {selected && selectedShift && (
        <div className="modal-overlay" onClick={e => { if (e.target===e.currentTarget) setSelected(null); }}>
          <div className="modal" style={{ maxWidth: 500 }}>{DetailPanel}</div>
        </div>
      )}
    </>
  );
}
