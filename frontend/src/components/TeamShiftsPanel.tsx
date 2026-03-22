import { useEffect, useState } from "react";
import { Plus, AlertCircle, CheckCircle2, X, Save, Trash2 } from "lucide-react";
import { api, apiError } from "../api/client";
import { Shift, ShiftDefinition, TeamMemberShifts, User, WorkStationDefinition, buildShiftMap } from "../types";

type Props = {
  currentUser: User;
  definitions: ShiftDefinition[];
  stationDefs: WorkStationDefinition[];
  standardHours: number;
  onRefresh?: () => void;
};

const MONTHS_IT = ["","Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
function daysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }

export function TeamShiftsPanel({ currentUser, definitions, stationDefs, standardHours, onRefresh }: Props) {
  const [teamShifts, setTeamShifts] = useState<TeamMemberShifts[]>([]);
  const [loading, setLoading] = useState(true);
  // Stations per user+date: "userId_date" -> station_code
  const [stationMap, setStationMap] = useState<Record<string, string>>({});

  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);

  // Detail modal
  const [selectedShift, setSelectedShift] = useState<{ shift: Shift; userName: string } | null>(null);
  const [editShift, setEditShift] = useState<{
    shift_code: string; shift_label: string;
    actual_time_start: string; actual_time_end: string; notes: string;
    station_code: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modalFlash, setModalFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  // Manual entry
  const [showManual, setShowManual] = useState(false);
  const [manualUserId, setManualUserId] = useState("");
  const [manualYear, setManualYear] = useState(new Date().getFullYear());
  const [manualMonth, setManualMonth] = useState(new Date().getMonth() + 1);
  const [manualAssignments, setManualAssignments] = useState<Record<number, string>>({});
  const [manualStations, setManualStations] = useState<Record<number, string>>({});
  const [manualSaving, setManualSaving] = useState(false);
  const [manualStatus, setManualStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const shiftDefs = buildShiftMap(definitions);
  const stationDefMap = Object.fromEntries(stationDefs.map(d => [d.code, d]));

  function shiftColor(code: string) { return shiftDefs[code]?.color || "#475569"; }
  function stationColor(code: string) { return stationDefMap[code]?.color || "#6ee7b7"; }

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<TeamMemberShifts[]>("/manager/team/shifts");
      setTeamShifts(data);
      // Build station map from all stations of all users
      const allStations = await Promise.all(
        data.map(m => api.get(`/workstations/user/${m.user.id}`).catch(() => ({ data: [] })))
      );
      const map: Record<string, string> = {};
      data.forEach((m, i) => {
        const stations = (allStations[i] as { data: { assigned_date?: string; station_code: string }[] }).data;
        stations.forEach((s) => {
          if (s.assigned_date) map[`${m.user.id}_${s.assigned_date}`] = s.station_code;
        });
      });
      setStationMap(map);
    } catch { /**/ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function getShiftForDay(shifts: Shift[], day: number): Shift | undefined {
    const dateStr = `${filterYear}-${String(filterMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return shifts.find(s => s.shift_date === dateStr);
  }

  function openModal(shift: Shift, userName: string, userId: number) {
    const key = `${userId}_${shift.shift_date}`;
    setSelectedShift({ shift, userName });
    setEditShift({
      shift_code: shift.shift_code, shift_label: shift.shift_label,
      actual_time_start: shift.actual_time_start ?? "",
      actual_time_end: shift.actual_time_end ?? "",
      notes: shift.notes ?? "",
      station_code: stationMap[key] ?? "",
    });
    setModalFlash(null);
  }

  function handleEditCode(code: string) {
    if (!editShift) return;
    const def = shiftDefs[code.toUpperCase()];
    setEditShift({ ...editShift, shift_code: code.toUpperCase(), shift_label: def ? def.label : editShift.shift_label });
  }

  function previewOt(): string {
    if (!editShift || !selectedShift) return "";
    const ts = editShift.actual_time_start || selectedShift.shift.time_start || "";
    const te = editShift.actual_time_end || selectedShift.shift.time_end || "";
    if (!ts || !te) return "";
    const [sh,sm]=ts.split(":").map(Number); const [eh,em]=te.split(":").map(Number);
    if (isNaN(sh)||isNaN(eh)) return "";
    let start=sh*60+(sm||0), end=eh*60+(em||0);
    if (end<=start) end+=24*60;
    const hw=(end-start)/60; const ot=Math.max(0,hw-standardHours);
    return `${hw.toFixed(1)}h${ot>0?` (+${ot.toFixed(1)}h stra.)`:""}`;
  }

  async function saveEdit() {
    if (!selectedShift||!editShift) return;
    setSaving(true);
    try {
      await api.patch(`/shifts/${selectedShift.shift.id}`, {
        shift_code: editShift.shift_code, shift_label: editShift.shift_label,
        actual_time_start: editShift.actual_time_start||null,
        actual_time_end: editShift.actual_time_end||null,
        notes: editShift.notes||null,
      });
      if (editShift.station_code) {
        await api.patch(`/shifts/${selectedShift.shift.id}/station`, null, {
          params: { station_code: editShift.station_code }
        });
      }
      setModalFlash({ ok: true, msg: "Turno aggiornato" });
      setTimeout(() => { setSelectedShift(null); load(); if (onRefresh) onRefresh(); }, 900);
    } catch (err) { setModalFlash({ ok: false, msg: apiError(err) }); }
    finally { setSaving(false); }
  }

  async function deleteShift() {
    if (!selectedShift) return;
    if (!confirm(`Eliminare il turno del ${selectedShift.shift.shift_date} per ${selectedShift.userName}?`)) return;
    setDeleting(true);
    const shiftId = selectedShift.shift.id;
    try {
      await api.delete(`/shifts/${shiftId}`);
      // Optimistic update: rimuovi subito dallo stato locale senza aspettare load()
      setTeamShifts(prev => prev.map(member => ({
        ...member,
        shifts: member.shifts.filter(s => s.id !== shiftId),
      })));
      setSelectedShift(null);
      if (onRefresh) onRefresh();  // ricarica dashboard in background
    } catch (err) { setModalFlash({ ok: false, msg: apiError(err) }); }
    finally { setDeleting(false); }
  }

  function loadManualExisting(userId: string, year: number, month: number) {
    const member = teamShifts.find(m => String(m.user.id) === userId);
    if (!member) { setManualAssignments({}); setManualStations({}); return; }
    const assignments: Record<number, string> = {};
    const stations: Record<number, string> = {};
    member.shifts.forEach(s => {
      const [y,m2]=s.shift_date.split("-").map(Number);
      if (y===year&&m2===month) {
        const day=Number(s.shift_date.split("-")[2]);
        assignments[day]=s.shift_code;
        const key=`${member.user.id}_${s.shift_date}`;
        if (stationMap[key]) stations[day]=stationMap[key];
      }
    });
    setManualAssignments(assignments); setManualStations(stations);
  }

  async function saveManual() {
    if (!manualUserId) return;
    setManualSaving(true); setManualStatus(null);
    let saved=0, errors=0;
    for (const [dayStr, code] of Object.entries(manualAssignments)) {
      if (!code) continue;
      const day=Number(dayStr);
      const def=shiftDefs[code];
      if (!def) continue;
      const dateStr=`${manualYear}-${String(manualMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      try {
        await api.post("/shifts/manual", {
          user_id: Number(manualUserId), shift_date: dateStr,
          shift_code: code, shift_label: def.label,
          time_start: def.time_start||null, time_end: def.time_end||null,
          station_code: manualStations[day]||null,
        });
        saved++;
      } catch { errors++; }
    }
    setManualStatus({ ok: errors===0, msg: `${saved} turni salvati${errors>0?`, ${errors} errori`:""}` });
    setManualSaving(false);
    if (errors===0) { setShowManual(false); setManualAssignments({}); setManualStations({}); load(); if (onRefresh) onRefresh(); }
  }

  function prevMonth() { if (filterMonth===1){setFilterMonth(12);setFilterYear(y=>y-1);}else setFilterMonth(m=>m-1); }
  function nextMonth() { if (filterMonth===12){setFilterMonth(1);setFilterYear(y=>y+1);}else setFilterMonth(m=>m+1); }

  const numDays=daysInMonth(filterYear,filterMonth);
  const days=Array.from({length:numDays},(_,i)=>i+1);
  const members=teamShifts.map(m=>m.user);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div className="card card-pad">
        {/* Header */}
        <div className="team-panel-header" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div className="label">Manager</div>
            <h2 className="heading" style={{ fontSize:20, marginTop:4 }}>Turni del team</h2>
            <div className="muted" style={{ fontSize:12 }}>Ore ordinarie: {standardHours}h · Clicca sul codice per modificare</div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={prevMonth}>◀</button>
            <span style={{ fontFamily:"var(--font-display)", fontWeight:600, fontSize:14, minWidth:130, textAlign:"center" }}>
              {MONTHS_IT[filterMonth]} {filterYear}
            </span>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={nextMonth}>▶</button>
            <button className="btn btn-primary btn-sm" onClick={()=>{setShowManual(v=>!v);setManualStatus(null);}}>
              <Plus size={13}/> Inserimento manuale
            </button>
          </div>
        </div>

        {/* Manual entry */}
        {showManual && (
          <div className="fade-in" style={{ padding:14, borderRadius:"var(--radius-sm)", background:"rgba(110,231,183,.06)", border:"1px solid rgba(110,231,183,.2)", marginBottom:16 }}>
            <div className="heading" style={{ fontSize:14, marginBottom:12 }}>Inserimento manuale — seleziona turni per mese</div>
            <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"flex-end" }}>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Utente *</div>
                <select className="input" style={{ minWidth:200 }} value={manualUserId}
                  onChange={e=>{setManualUserId(e.target.value);loadManualExisting(e.target.value,manualYear,manualMonth);}}>
                  <option value="">Seleziona utente…</option>
                  {members.map(m=><option key={m.id} value={m.id}>{m.full_name} ({m.employee_code})</option>)}
                </select>
              </div>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Mese</div>
                <select className="input" value={manualMonth}
                  onChange={e=>{const v=Number(e.target.value);setManualMonth(v);if(manualUserId)loadManualExisting(manualUserId,manualYear,v);}}>
                  {MONTHS_IT.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Anno</div>
                <input className="input" type="number" style={{ width:90 }} value={manualYear}
                  onChange={e=>{const v=Number(e.target.value);setManualYear(v);if(manualUserId)loadManualExisting(manualUserId,v,manualMonth);}}/>
              </div>
            </div>

            {manualUserId && (
              <div style={{ overflowX:"auto", marginBottom:12 }}>
                <div style={{ display:"grid", gridTemplateColumns:`90px repeat(${daysInMonth(manualYear,manualMonth)}, 60px)`, gap:4, minWidth:"max-content" }}>
                  {/* Header row */}
                  <div style={{ fontSize:10, color:"var(--text-3)", fontWeight:700, alignSelf:"center" }}>Giorno →</div>
                  {Array.from({length:daysInMonth(manualYear,manualMonth)},(_,i)=>i+1).map(day=>(
                    <div key={day} style={{ textAlign:"center", fontSize:11, fontWeight:700, color:"var(--text-2)", padding:"4px 0" }}>
                      {String(day).padStart(2,"0")}
                    </div>
                  ))}
                  {/* Turno row */}
                  <div style={{ fontSize:11, color:"var(--text-2)", alignSelf:"center", fontWeight:600 }}>Turno</div>
                  {Array.from({length:daysInMonth(manualYear,manualMonth)},(_,i)=>i+1).map(day=>{
                    const code=manualAssignments[day]||"";
                    const def=code?shiftDefs[code]:null;
                    const color=def?.color||"transparent";
                    return (
                      <select key={day}
                        style={{ width:60, height:40, borderRadius:8, border:`2px solid ${code?color:"var(--border)"}`, background:code?`${color}22`:"rgba(255,255,255,.04)", color:code?color:"var(--text-3)", fontWeight:700, fontSize:12, textAlign:"center", cursor:"pointer", outline:"none", fontFamily:"var(--font-display)" }}
                        value={code}
                        onChange={e=>setManualAssignments(p=>({...p,[day]:e.target.value}))}>
                        <option value="">—</option>
                        {definitions.map(d=><option key={d.code} value={d.code}>{d.code}</option>)}
                      </select>
                    );
                  })}
                  {/* Postazione row — only if stationDefs configured */}
                  {stationDefs.length > 0 && (
                    <>
                      <div style={{ fontSize:11, color:"var(--text-2)", alignSelf:"center", fontWeight:600 }}>Postazione</div>
                      {Array.from({length:daysInMonth(manualYear,manualMonth)},(_,i)=>i+1).map(day=>{
                        const sc=manualStations[day]||"";
                        const sdef=sc?stationDefMap[sc]:null;
                        const scolor=sdef?.color||"transparent";
                        return (
                          <select key={`st-${day}`}
                            style={{ width:60, height:36, borderRadius:8, border:`2px solid ${sc?scolor:"var(--border)"}`, background:sc?`${scolor}22`:"rgba(255,255,255,.04)", color:sc?scolor:"var(--text-3)", fontWeight:700, fontSize:11, textAlign:"center", cursor:"pointer", outline:"none" }}
                            value={sc}
                            onChange={e=>setManualStations(p=>({...p,[day]:e.target.value}))}>
                            <option value="">—</option>
                            {stationDefs.map(d=><option key={d.code} value={d.code}>{d.code}</option>)}
                          </select>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            )}

            {manualStatus && (
              <div className={`msg ${manualStatus.ok?"msg-success":"msg-error"}`} style={{ marginBottom:10 }}>
                {manualStatus.ok?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>}{manualStatus.msg}
              </div>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn btn-primary btn-sm" onClick={saveManual}
                disabled={manualSaving||!manualUserId||Object.values(manualAssignments).filter(Boolean).length===0}>
                {manualSaving?<span className="spinner spinner-sm"/>:<Save size={13}/>} Salva turni
              </button>
              <button className="btn btn-ghost btn-sm" onClick={()=>{setShowManual(false);setManualAssignments({});setManualStations({});setManualStatus(null);}}>Annulla</button>
            </div>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div style={{ display:"flex", justifyContent:"center", padding:32 }}><span className="spinner"/></div>
        ) : (
          <div style={{ overflowX:"auto" }} className="shift-grid-wrap">
            <table style={{ borderCollapse:"separate", borderSpacing:0, minWidth:"max-content" }}>
              <thead>
                <tr>
                  <th style={{ position:"sticky", left:0, zIndex:2, background:"var(--bg-2)", padding:"6px 12px 6px 0", fontSize:10, color:"var(--text-3)", fontWeight:700, textAlign:"left", borderRight:"1px solid var(--border)", whiteSpace:"nowrap" }}>Dipendente</th>
                  {days.map(day=>(
                    <th key={day} style={{ padding:"6px 2px", fontSize:10, fontWeight:700, color:"var(--text-3)", textAlign:"center", minWidth:38 }}>
                      {String(day).padStart(2,"0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamShifts.map((member,memberIdx)=>(
                  <tr key={member.user.id}>
                    <td style={{ position:"sticky", left:0, zIndex:1, background:memberIdx%2===0?"var(--bg-2)":"var(--bg-1)", padding:"8px 12px 8px 0", borderRight:"1px solid var(--border)", paddingTop:memberIdx>0?14:8 }}>
                      <div style={{ fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>{member.user.full_name}</div>
                      <div style={{ fontSize:10, color:"var(--text-3)" }}>{member.user.employee_code}</div>
                    </td>
                    {days.map(day=>{
                      const shift=getShiftForDay(member.shifts,day);
                      const color=shift?shiftColor(shift.shift_code):undefined;
                      const hasOt=(shift?.overtime_hours??0)>0;
                      const dateStr=`${filterYear}-${String(filterMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                      const stCode=stationMap[`${member.user.id}_${dateStr}`];
                      const stColor=stCode?stationColor(stCode):undefined;
                      return (
                        <td key={day} style={{ padding:"2px", paddingTop:memberIdx>0?10:2, verticalAlign:"middle" }}>
                          <div onClick={()=>shift&&openModal(shift,member.user.full_name,member.user.id)}
                            title={shift?`${shift.shift_label}${stCode?` · ${stCode}`:""}`:""}
                            style={{ width:36, height:36, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", background:shift?`${color}22`:"rgba(255,255,255,.03)", border:`1px solid ${shift?`${color}55`:"rgba(255,255,255,.06)"}`, cursor:shift?"pointer":"default", fontSize:10, fontWeight:800, color:shift?color:"var(--text-3)", position:"relative", transition:"transform .1s", fontFamily:"var(--font-display)" }}
                            onMouseEnter={e=>{if(shift)(e.currentTarget as HTMLElement).style.transform="scale(1.12)";}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="scale(1)";}}>
                            {shift?.shift_code||""}
                            {hasOt&&<span style={{ position:"absolute", top:2, right:2, width:4, height:4, borderRadius:"50%", background:"var(--warning)" }}/>}
                            {stCode&&<span style={{ position:"absolute", bottom:1, right:1, width:4, height:4, borderRadius:"50%", background:stColor||"#6ee7b7" }}/>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="card card-pad" style={{ display:"flex", flexWrap:"wrap", gap:"5px 16px" }}>
        {definitions.map(d=>(
          <div key={d.code} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11 }}>
            <div style={{ width:22, height:22, borderRadius:5, background:`${d.color}22`, border:`1px solid ${d.color}55`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:9, color:d.color, fontFamily:"var(--font-display)" }}>{d.code}</div>
            <span style={{ color:"var(--text-2)" }}>{d.label}{d.time_start&&<span style={{ color:"var(--text-3)", marginLeft:4 }}>{d.time_start.slice(0,5)}–{d.time_end?.slice(0,5)}</span>}</span>
          </div>
        ))}
        {stationDefs.length>0&&stationDefs.map(d=>(
          <div key={`st-${d.code}`} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:d.color }}/>
            <span style={{ color:"var(--text-3)" }}>📍 {d.code} {d.label}</span>
          </div>
        ))}
      </div>

      {/* Shift detail modal */}
      {selectedShift&&editShift&&(
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setSelectedShift(null);}}>
          <div className="modal" style={{ maxWidth:480 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div>
                <div className="heading" style={{ fontSize:16 }}>{selectedShift.userName}</div>
                <div className="muted" style={{ fontSize:12 }}>
                  {new Date(selectedShift.shift.shift_date+"T12:00:00").toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>setSelectedShift(null)}><X size={14}/></button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div className="label" style={{ marginBottom:4 }}>Codice turno</div>
                  <select className="input" value={editShift.shift_code} onChange={e=>handleEditCode(e.target.value)}>
                    {definitions.map(d=><option key={d.code} value={d.code}>{d.code} – {d.label}</option>)}
                    {!shiftDefs[editShift.shift_code]&&<option value={editShift.shift_code}>{editShift.shift_code}</option>}
                  </select>
                </div>
                <div>
                  <div className="label" style={{ marginBottom:4 }}>Etichetta</div>
                  <input className="input" value={editShift.shift_label} onChange={e=>setEditShift({...editShift,shift_label:e.target.value})}/>
                </div>
              </div>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Orario pianificato</div>
                <div className="muted" style={{ fontSize:12 }}>
                  {selectedShift.shift.time_start?`${selectedShift.shift.time_start.slice(0,5)} – ${selectedShift.shift.time_end?.slice(0,5)}`:"Non impostato"}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div className="label" style={{ marginBottom:4 }}>Inizio effettivo</div>
                  <input className="input" type="time" value={editShift.actual_time_start}
                    placeholder={selectedShift.shift.time_start?.slice(0,5)||""}
                    onChange={e=>setEditShift({...editShift,actual_time_start:e.target.value})}/>
                </div>
                <div>
                  <div className="label" style={{ marginBottom:4 }}>Fine effettiva</div>
                  <input className="input" type="time" value={editShift.actual_time_end}
                    placeholder={selectedShift.shift.time_end?.slice(0,5)||""}
                    onChange={e=>setEditShift({...editShift,actual_time_end:e.target.value})}/>
                </div>
              </div>
              {previewOt()&&(
                <div style={{ fontSize:12, padding:"5px 10px", borderRadius:8, background:"rgba(251,191,36,.12)", color:"var(--warning)", border:"1px solid rgba(251,191,36,.3)", alignSelf:"flex-start" }}>
                  ⏱ {previewOt()}
                </div>
              )}
              {/* Postazione */}
              {stationDefs.length>0&&(
                <div>
                  <div className="label" style={{ marginBottom:4 }}>Postazione</div>
                  <select className="input" value={editShift.station_code}
                    onChange={e=>setEditShift({...editShift,station_code:e.target.value})}>
                    <option value="">— nessuna —</option>
                    {stationDefs.map(d=>(
                      <option key={d.code} value={d.code}>{d.code} – {d.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <div className="label" style={{ marginBottom:4 }}>Note</div>
                <textarea className="input" style={{ resize:"vertical", minHeight:60 }} value={editShift.notes} placeholder="Opzionale"
                  onChange={e=>setEditShift({...editShift,notes:e.target.value})}/>
              </div>
            </div>

            {modalFlash&&(
              <div className={`msg ${modalFlash.ok?"msg-success":"msg-error"}`} style={{ marginTop:10 }}>
                {modalFlash.ok?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>}{modalFlash.msg}
              </div>
            )}
            <div style={{ display:"flex", gap:8, marginTop:14, justifyContent:"space-between" }}>
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving||deleting}>
                  {saving?<span className="spinner spinner-sm"/>:<Save size={13}/>} Salva
                </button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setSelectedShift(null)}>Annulla</button>
              </div>
              <button className="btn btn-danger btn-sm" onClick={deleteShift} disabled={saving||deleting}>
                {deleting?<span className="spinner spinner-sm"/>:<Trash2 size={13}/>} Elimina turno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
