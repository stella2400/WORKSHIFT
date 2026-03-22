import { useRef, useState } from "react";
import { Save, RotateCcw, Clock } from "lucide-react";
import { api, apiError } from "../api/client";
import { DashboardResponse, Shift, buildShiftMap } from "../types";

type Props = { dashboard: DashboardResponse; onRefresh: () => void; selectedMonth?: {year:number;month:number}|null; };
type Edit = { shift_code:string; shift_label:string; notes:string; actual_time_start:string; actual_time_end:string };

export function EditableDayTable({ dashboard, onRefresh, selectedMonth }: Props) {
  const { shifts, definitions, team_config, stations, station_definitions } = dashboard;
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [saving, setSaving] = useState<number|null>(null);
  const [flash, setFlash] = useState<{id:number;ok:boolean;text:string}|null>(null);
  const [filter, setFilter] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // All from config
  const shiftDefs = buildShiftMap(definitions);
  const stationDefMap = Object.fromEntries(station_definitions.map(d => [d.code, d]));
  // date -> station entry
  const stationByDate = Object.fromEntries(stations.filter(s => s.assigned_date).map(s => [s.assigned_date!, s]));

  const stdHours = team_config?.standard_hours ?? 6;

  function shiftColor(code: string) { return shiftDefs[code]?.color || "var(--text-3)"; }
  function stationLabel(code: string) { return stationDefMap[code]?.label || code; }

  function getEdit(s: Shift): Edit {
    return edits[s.id] ?? {
      shift_code: s.shift_code, shift_label: s.shift_label,
      notes: s.notes ?? "", actual_time_start: s.actual_time_start ?? "", actual_time_end: s.actual_time_end ?? "",
    };
  }

  function handleCodeChange(s: Shift, code: string) {
    const upper = code.toUpperCase();
    const def = shiftDefs[upper];
    setEdits(p => ({ ...p, [s.id]: { ...getEdit(s), ...p[s.id], shift_code: upper, shift_label: def ? def.label : (p[s.id]?.shift_label ?? s.shift_label) } }));
  }
  function setField(id: number, s: Shift, partial: Partial<Edit>) {
    setEdits(p => ({ ...p, [id]: { ...getEdit(s), ...p[id], ...partial } }));
  }

  function previewOt(s: Shift, e: Edit): { hours: number|null; ot: number|null } {
    const ts = e.actual_time_start || s.time_start || "";
    const te = e.actual_time_end || s.time_end || "";
    if (!ts || !te) return { hours: null, ot: null };
    const [sh,sm] = ts.split(":").map(Number);
    const [eh,em] = te.split(":").map(Number);
    if (isNaN(sh) || isNaN(eh)) return { hours: null, ot: null };
    let start = sh*60+(sm||0), end = eh*60+(em||0);
    if (end <= start) end += 24*60;
    const hw = (end-start)/60;
    return { hours: Math.round(hw*10)/10, ot: Math.round(Math.max(0, hw-stdHours)*10)/10 };
  }

  async function save(s: Shift) {
    const e = edits[s.id];
    if (!e) return;
    setSaving(s.id);
    try {
      // If user filled only one side, use planned time as fallback for the other
      const hasStart = !!e.actual_time_start;
      const hasEnd = !!e.actual_time_end;
      const effectiveStart = hasStart ? e.actual_time_start
                           : (hasEnd ? (s.time_start || null) : null);
      const effectiveEnd   = hasEnd ? e.actual_time_end
                           : (hasStart ? (s.time_end || null) : null);
      await api.patch(`/shifts/${s.id}`, {
        shift_code: e.shift_code, shift_label: e.shift_label,
        notes: e.notes || null,
        actual_time_start: effectiveStart,
        actual_time_end: effectiveEnd,
      });
      setEdits(p => { const n={...p}; delete n[s.id]; return n; });
      showFlash(s.id, true, "✓"); onRefresh();
    } catch(err) { showFlash(s.id, false, apiError(err)); }
    finally { setSaving(null); }
  }

  function discard(id: number) { setEdits(p => { const n={...p}; delete n[id]; return n; }); }
  function showFlash(id: number, ok: boolean, text: string) {
    if (timer.current) clearTimeout(timer.current);
    setFlash({ id, ok, text });
    timer.current = setTimeout(() => setFlash(null), 2500);
  }

  const filtered = shifts.filter(s => {
    // Filter by selected month if set
    if (selectedMonth) {
      const prefix = `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}`;
      if (!s.shift_date.startsWith(prefix)) return false;
    }
    if (!filter) return true;
    const f = filter.toLowerCase();
    return s.shift_code.toLowerCase().includes(f) || s.shift_label.toLowerCase().includes(f) || s.shift_date.includes(f);
  });

  return (
    <div className="card card-pad" style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <div>
          <div className="label">Turni</div>
          <h2 className="heading" style={{ fontSize:18, marginTop:4 }}>Modifica turni</h2>
          <div className="muted" style={{ fontSize:11, marginTop:1 }}>Ore ordinarie: {stdHours}h/giorno</div>
        </div>
        <input className="input" style={{ maxWidth:160 }} placeholder="Filtra…" value={filter} onChange={e => setFilter(e.target.value)}/>
      </div>

      {filtered.length===0 ? (
        <div className="empty-state"><div style={{ fontSize:13 }}>Nessun turno</div></div>
      ) : (
        <div style={{ maxHeight:520, overflow:"auto", marginRight:-6, paddingRight:6 }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Codice</th>
                <th>Etichetta</th>
                <th style={{ minWidth:100 }}><Clock size={9} style={{ display:"inline", marginRight:3 }}/>Pianificato</th>
                <th>Inizio eff.</th>
                <th>Fine eff.</th>
                <th>Ore</th>
                <th style={{ width:70 }}/>
              </tr>
            </thead>
            <tbody>
              {filtered.map(shift => {
                const e = getEdit(shift);
                const isDirty = shift.id in edits;
                const isSaving = saving===shift.id;
                const color = shiftColor(e.shift_code);
                const { hours, ot } = previewOt(shift, e);
                const scheduledLabel = shift.time_start && shift.time_end
                  ? `${shift.time_start.slice(0,5)}–${shift.time_end.slice(0,5)}`
                  : "—";
                const station = stationByDate[shift.shift_date];
                return (
                  <tr key={shift.id}>
                    <td style={{ whiteSpace:"nowrap", color:"var(--text-2)", fontSize:11 }}>
                      {new Date(shift.shift_date+"T12:00:00").toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit"})}
                      {shift.manually_edited && <span style={{ color:"var(--warning)", marginLeft:3, fontSize:9 }}>✎</span>}
                      {station && (
                        <div style={{ fontSize:9, color:stationDefMap[station.station_code]?.color||"var(--accent-2)", marginTop:1 }}>
                          📍 {station.station_code}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:color, flexShrink:0 }}/>
                        <select className="input"
                          style={{ padding:"3px 5px", width:"auto", minWidth:56, fontSize:11, borderColor:isDirty?"var(--accent)":undefined }}
                          value={e.shift_code}
                          onChange={ev => handleCodeChange(shift, ev.target.value)}>
                          {definitions.map(d => <option key={d.code} value={d.code}>{d.code}</option>)}
                          {!shiftDefs[e.shift_code] && <option value={e.shift_code}>{e.shift_code}</option>}
                        </select>
                      </div>
                    </td>
                    <td>
                      <input className="input" style={{ padding:"3px 5px", fontSize:11, borderColor:isDirty?"var(--accent)":undefined }}
                        value={e.shift_label}
                        onChange={ev => setField(shift.id, shift, { shift_label: ev.target.value })}/>
                    </td>
                    <td style={{ fontSize:11, color:"var(--text-3)", whiteSpace:"nowrap" }}>{scheduledLabel}</td>
                    <td>
                      <input className="input" type="time" style={{ padding:"3px 5px", fontSize:11, width:82 }}
                        value={e.actual_time_start}
                        placeholder={shift.time_start?.slice(0,5)||""}
                        onChange={ev => setField(shift.id, shift, { actual_time_start: ev.target.value })}/>
                    </td>
                    <td>
                      <input className="input" type="time" style={{ padding:"3px 5px", fontSize:11, width:82 }}
                        value={e.actual_time_end}
                        placeholder={shift.time_end?.slice(0,5)||""}
                        onChange={ev => setField(shift.id, shift, { actual_time_end: ev.target.value })}/>
                    </td>
                    <td style={{ fontSize:11, whiteSpace:"nowrap" }}>
                      {hours !== null ? (
                        <span>
                          {hours}h
                          {ot !== null && ot > 0 && <span style={{ color:"var(--warning)", marginLeft:3 }}>+{ot}h</span>}
                        </span>
                      ) : (shift.hours_worked ?? 0) > 0 ? (
                        <span>
                          {shift.hours_worked}h
                          {(shift.overtime_hours ?? 0) > 0 && <span style={{ color:"var(--warning)", marginLeft:3 }}>+{shift.overtime_hours}h</span>}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {isDirty ? (
                        <div style={{ display:"flex", gap:3 }}>
                          <button className="btn btn-primary btn-sm btn-icon" onClick={() => save(shift)} disabled={isSaving}>
                            {isSaving ? <span className="spinner spinner-sm"/> : <Save size={11}/>}
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => discard(shift.id)}>
                            <RotateCcw size={11}/>
                          </button>
                        </div>
                      ) : flash?.id===shift.id ? (
                        <span style={{ fontSize:10, color:flash.ok?"var(--accent)":"var(--danger)" }}>{flash.text}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
