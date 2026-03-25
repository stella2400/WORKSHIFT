import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Save, Key, User as UserIcon, AlertCircle, CheckCircle2, Clock, Settings, MapPin } from "lucide-react";
import { api, apiError } from "../api/client";
import { ShiftDefinition, TeamConfig, User, WorkStationDefinition } from "../types";

type Props = { currentUser: User; onUserUpdate: (u: User) => void; onRefresh?: () => void };

// Inline color picker that's intuitive: shows a swatch + opens a popover with swatches + custom hex
const PRESET_COLORS = [
  "#22c55e","#16a34a","#86efac",  // greens
  "#8b5cf6","#7c3aed","#c4b5fd",  // purples
  "#0ea5e9","#0284c7","#7dd3fc",  // blues
  "#f59e0b","#d97706","#fde68a",  // ambers
  "#ef4444","#dc2626","#fca5a5",  // reds
  "#6366f1","#4f46e5","#a5b4fc",  // indigos
  "#14b8a6","#0d9488","#99f6e4",  // teals
  "#f97316","#ea580c","#fdba74",  // oranges
  "#64748b","#475569","#94a3b8",  // slates
  "#ec4899","#db2777","#f9a8d4",  // pinks
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  useEffect(() => { setHex(value); }, [value]);
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openPicker() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 230) });
    }
    setOpen(v => !v);
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button ref={btnRef} type="button" onClick={openPicker}
        style={{ width: 34, height: 34, borderRadius: 8, background: value, border: "2px solid rgba(255,255,255,.25)", cursor: "pointer", flexShrink: 0 }}
        title="Scegli colore"/>
      {open && (
        <div style={{
          position: "fixed", top: popoverPos.top, left: popoverPos.left, zIndex: 9999,
          background: "var(--bg-2)", border: "1px solid var(--border)",
          borderRadius: 12, padding: 12, boxShadow: "0 8px 32px rgba(0,0,0,.6)",
          width: 220,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5, marginBottom: 10 }}>
            {PRESET_COLORS.map(c => (
              <button key={c} type="button" onClick={() => { onChange(c); setHex(c); setOpen(false); }}
                style={{
                  width: 28, height: 28, borderRadius: 7, background: c,
                  border: c === value ? "2px solid white" : "2px solid transparent",
                  cursor: "pointer", transition: "transform .1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}/>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="color" value={hex} onChange={e => { setHex(e.target.value); onChange(e.target.value); }}
              style={{ width: 34, height: 34, border: "none", background: "none", cursor: "pointer", padding: 0, borderRadius: 6 }}/>
            <input className="input" style={{ flex: 1, padding: "4px 8px", fontSize: 12, fontFamily: "monospace" }}
              value={hex} maxLength={7}
              onChange={e => { const v = e.target.value; setHex(v); if (/^#[0-9a-fA-F]{6}$/.test(v)) { onChange(v); } }}
              placeholder="#22c55e"/>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPanel({ currentUser, onUserUpdate, onRefresh }: Props) {
  const isManager = currentUser.role === "manager";
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [stations, setStations] = useState<WorkStationDefinition[]>([]);
  const [teamConfig, setTeamConfig] = useState<TeamConfig | null>(null);
  const [shiftStatus, setShiftStatus] = useState<{ok:boolean;msg:string}|null>(null);
  const [stationStatus, setStationStatus] = useState<{ok:boolean;msg:string}|null>(null);
  const [cfgStatus, setCfgStatus] = useState<{ok:boolean;msg:string}|null>(null);
  const [saving, setSaving] = useState(false);
  const [stationSaving, setStationSaving] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [profile, setProfile] = useState({ full_name:currentUser.full_name, email:currentUser.email, company_name:currentUser.company_name??"", team_name:currentUser.team_name??"" });
  const [profileStatus, setProfileStatus] = useState<{ok:boolean;msg:string}|null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [pwd, setPwd] = useState({ current:"", new1:"", new2:"" });
  const [pwdStatus, setPwdStatus] = useState<{ok:boolean;msg:string}|null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  async function loadAll() {
    try {
      const [s, st, cfg] = await Promise.all([
        api.get<ShiftDefinition[]>("/settings/shifts"),
        api.get<WorkStationDefinition[]>("/settings/stations"),
        api.get<TeamConfig>("/settings/team-config"),
      ]);
      setShifts(s.data); setStations(st.data); setTeamConfig(cfg.data);
    } catch { /**/ }
  }
  useEffect(() => { loadAll(); }, []);

  function updShift(i: number, partial: Partial<ShiftDefinition>) { setShifts(p => p.map((it,idx) => idx===i ? {...it,...partial} : it)); }
  function updStation(i: number, partial: Partial<WorkStationDefinition>) { setStations(p => p.map((it,idx) => idx===i ? {...it,...partial} : it)); }

  async function saveShifts() {
    setSaving(true); setShiftStatus(null);
    try {
      await api.put("/settings/shifts", shifts.map(({code,label,color,category,sort_order,time_start,time_end,default_hours}) => ({
        code: code.toUpperCase(), label, color, category, sort_order,
        time_start: time_start||null, time_end: time_end||null, default_hours: default_hours||null,
      })));
      setShiftStatus({ok:true,msg:"Salvati"}); loadAll(); if (onRefresh) onRefresh();
    } catch(err) { setShiftStatus({ok:false,msg:apiError(err)}); } finally { setSaving(false); }
  }

  async function saveStations() {
    setStationSaving(true); setStationStatus(null);
    try {
      await api.put("/settings/stations", stations.map(({code,label,color,sort_order}) => ({
        code: code.toUpperCase(), label, color, sort_order,
      })));
      setStationStatus({ok:true,msg:"Salvate"}); loadAll(); if (onRefresh) onRefresh();
    } catch(err) { setStationStatus({ok:false,msg:apiError(err)}); } finally { setStationSaving(false); }
  }

  async function saveConfig() {
    if (!teamConfig) return; setCfgSaving(true); setCfgStatus(null);
    try {
      await api.put("/settings/team-config", { standard_hours: teamConfig.standard_hours, search_by: teamConfig.search_by });
      setCfgStatus({ok:true,msg:"Salvata"});
    } catch(err) { setCfgStatus({ok:false,msg:apiError(err)}); } finally { setCfgSaving(false); }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setProfileSaving(true); setProfileStatus(null);
    try {
      const { data } = await api.patch("/users/me", { full_name:profile.full_name, email:profile.email, company_name:profile.company_name||undefined, team_name:profile.team_name||undefined });
      onUserUpdate(data); setProfileStatus({ok:true,msg:"Aggiornato"});
    } catch(err) { setProfileStatus({ok:false,msg:apiError(err)}); } finally { setProfileSaving(false); }
  }

  async function changePwd(e: React.FormEvent) {
    e.preventDefault(); setPwdStatus(null);
    if (pwd.new1 !== pwd.new2) { setPwdStatus({ok:false,msg:"Le password non coincidono"}); return; }
    setPwdSaving(true);
    try {
      await api.post("/users/me/change-password", { current_password:pwd.current, new_password:pwd.new1 });
      setPwdStatus({ok:true,msg:"Aggiornata"}); setPwd({current:"",new1:"",new2:""});
    } catch(err) { setPwdStatus({ok:false,msg:apiError(err)}); } finally { setPwdSaving(false); }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      {currentUser.must_change_password && (
        <div className="msg msg-warning"><AlertCircle size={14}/><span>Password temporanea. Aggiornala subito.</span></div>
      )}

      <div className="grid-2 settings-grid">
        {/* Profile */}
        <div className="card card-pad">
          <div className="label" style={{marginBottom:4}}><UserIcon size={11} style={{display:"inline",marginRight:5}}/>Dati personali</div>
          <h2 className="heading" style={{fontSize:18,marginBottom:14}}>Profilo</h2>
          {/* Dati personali: solo visualizzazione. Modificabili solo dall'admin. */}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[{l:"Nome e cognome",v:currentUser.full_name},{l:"Email",v:currentUser.email},{l:"Azienda",v:currentUser.company_name||"—"},{l:"Team",v:currentUser.team_name||"—"},{l:"Matricola",v:currentUser.employee_code}].map(({l,v})=>(
              <div key={l}>
                <div className="label" style={{marginBottom:4}}>{l}</div>
                <div style={{padding:"9px 12px",borderRadius:"var(--radius-sm)",background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",fontSize:14,color:"var(--text-2)"}}>{v}</div>
              </div>
            ))}
            <div className="muted" style={{fontSize:11,marginTop:4}}>ℹ Per modificare i dati personali contatta l'amministratore.</div>
          </div>
        </div>

        {/* Password */}
        <div className="card card-pad">
          <div className="label" style={{marginBottom:4}}><Key size={11} style={{display:"inline",marginRight:5}}/>Sicurezza</div>
          <h2 className="heading" style={{fontSize:18,marginBottom:14}}>Password</h2>
          <form onSubmit={changePwd} style={{display:"flex",flexDirection:"column",gap:10}}>
            {[{l:"Attuale",k:"current"},{l:"Nuova",k:"new1"},{l:"Conferma",k:"new2"}].map(({l,k})=>(
              <div key={k}>
                <div className="label" style={{marginBottom:4}}>{l}</div>
                <input className="input" type="password" placeholder="••••••••" value={(pwd as Record<string,string>)[k]} onChange={e=>setPwd(pw=>({...pw,[k]:e.target.value}))}/>
              </div>
            ))}
            {pwdStatus && <div className={`msg ${pwdStatus.ok?"msg-success":"msg-error"}`}>{pwdStatus.ok?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>}{pwdStatus.msg}</div>}
            <button className="btn btn-primary btn-sm" type="submit" disabled={pwdSaving} style={{alignSelf:"flex-start"}}>{pwdSaving?<span className="spinner spinner-sm"/>:<Key size={13}/>} Aggiorna</button>
          </form>
        </div>
      </div>

      {/* Team config */}
      {isManager && teamConfig && (
        <div className="card card-pad">
          <div className="label" style={{marginBottom:4}}><Settings size={11} style={{display:"inline",marginRight:5}}/>Configurazione team</div>
          <h2 className="heading" style={{fontSize:18,marginBottom:14}}>Impostazioni team</h2>
          <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div>
              <div className="label" style={{marginBottom:4}}>Ore ordinarie giornaliere</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input className="input" type="number" step="0.5" min="1" max="24" style={{width:100}} value={teamConfig.standard_hours} onChange={e=>setTeamConfig({...teamConfig,standard_hours:Number(e.target.value)})}/>
                <span className="muted">ore/giorno</span>
              </div>
            </div>
            <div>
              <div className="label" style={{marginBottom:4}}>Cerca utenti nel file per</div>
              <select className="input" style={{minWidth:180}} value={teamConfig.search_by} onChange={e=>setTeamConfig({...teamConfig,search_by:e.target.value})}>
                <option value="matricola">Matricola</option>
                <option value="nome">Nome e cognome</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={cfgSaving}>{cfgSaving?<span className="spinner spinner-sm"/>:<Save size={13}/>} Salva</button>
            {cfgStatus && <span style={{fontSize:12,color:cfgStatus.ok?"var(--accent)":"var(--danger)"}}>{cfgStatus.msg}</span>}
          </div>
        </div>
      )}

      {/* Shift definitions */}
      <div className="card card-pad">
        <div className="label" style={{marginBottom:4}}><Clock size={11} style={{display:"inline",marginRight:5}}/>Codici turno</div>
        <h2 className="heading" style={{fontSize:18,marginBottom:4}}>Configurazione turni</h2>
        <p className="muted" style={{fontSize:12,marginBottom:12}}>{isManager?"Colori, orari e categorie usati in tutta l'app.":"Sola lettura — modificabile dal manager."}</p>
        <div style={{display:"grid",gridTemplateColumns:"68px 1fr 76px 76px 60px 44px 90px 34px",gap:6,marginBottom:7}}>
          {["Codice","Etichetta","Inizio","Fine","Ore","Colore","Categoria",""].map((h,i)=>(
            <div key={i} className="label" style={{fontSize:9}}>{h}</div>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:300,overflow:"auto",paddingRight:4}}>
          {shifts.map((item, i) => (
            <div key={item.id} style={{display:"grid",gridTemplateColumns:"68px 1fr 76px 76px 60px 44px 90px 34px",gap:6,alignItems:"center"}}>
              <input className="input" style={{padding:"4px 7px",fontWeight:700,textTransform:"uppercase",fontSize:12}} value={item.code} maxLength={6} disabled={!isManager} onChange={e=>updShift(i,{code:e.target.value.toUpperCase()})}/>
              <input className="input" style={{padding:"4px 7px",fontSize:12}} disabled={!isManager} value={item.label} onChange={e=>updShift(i,{label:e.target.value})}/>
              <input className="input" style={{padding:"4px 7px",fontSize:12,opacity:item.category!=="work"?.4:1}} disabled={!isManager||item.category!=="work"} value={item.category==="work"?(item.time_start||""):""} onChange={e=>updShift(i,{time_start:e.target.value||null})} placeholder={item.category==="work"?"08:00":"—"}/>
              <input className="input" style={{padding:"4px 7px",fontSize:12,opacity:item.category!=="work"?.4:1}} disabled={!isManager||item.category!=="work"} value={item.category==="work"?(item.time_end||""):""} onChange={e=>updShift(i,{time_end:e.target.value||null})} placeholder={item.category==="work"?"14:00":"—"}/>
              <input className="input" type="number" step="0.5" min="0" max="24" style={{padding:"4px 5px",fontSize:12,opacity:item.category!=="work"?.4:1}} disabled={!isManager||item.category!=="work"} value={item.category==="work"?(item.default_hours??""):""}  onChange={e=>updShift(i,{default_hours:e.target.value?Number(e.target.value):null})} placeholder={item.category==="work"?"6":"—"}/>
              {isManager
                ? <ColorPicker value={item.color} onChange={c => updShift(i, { color: c })}/>
                : <div style={{width:34,height:34,borderRadius:8,background:item.color,border:"2px solid rgba(255,255,255,.2)"}}/>
              }
              <select className="input" style={{padding:"4px 6px",fontSize:11}} disabled={!isManager} value={item.category} onChange={e=>{
                const cat=e.target.value;
                updShift(i, cat!=="work"
                  ? {category:cat, time_start:null, time_end:null, default_hours:null}
                  : {category:cat});
              }}>
                <option value="work">Lavoro</option>
                <option value="off">Riposo</option>
                <option value="transition">Transizione</option>
              </select>
              {isManager
                ? <button className="btn btn-danger btn-sm btn-icon" onClick={()=>setShifts(p=>p.filter((_,idx)=>idx!==i))}><Trash2 size={11}/></button>
                : <div/>
              }
            </div>
          ))}
        </div>
        {isManager && (
          <div style={{display:"flex",gap:8,marginTop:10,alignItems:"center"}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShifts(p=>[...p,{id:Date.now(),code:"",label:"",color:"#94a3b8",category:"work",sort_order:p.length,is_active:true,time_start:null,time_end:null,default_hours:null}])}>
              <Plus size={12}/> Aggiungi
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveShifts} disabled={saving}>{saving?<span className="spinner spinner-sm"/>:<Save size={12}/>} Salva tutto</button>
            {shiftStatus && <span style={{fontSize:12,color:shiftStatus.ok?"var(--accent)":"var(--danger)"}}>{shiftStatus.msg}</span>}
          </div>
        )}
      </div>

      {/* Workstation definitions */}
      {isManager && (
        <div className="card card-pad">
          <div className="label" style={{marginBottom:4}}><MapPin size={11} style={{display:"inline",marginRight:5}}/>Postazioni</div>
          <h2 className="heading" style={{fontSize:18,marginBottom:4}}>Codici postazione</h2>
          <p className="muted" style={{fontSize:12,marginBottom:12}}>Definisci i codici del file postazioni (es. P1, P9). Colori e etichette usati in tutta l'app.</p>
          <div style={{display:"grid",gridTemplateColumns:"80px 1fr 44px 34px",gap:6,marginBottom:7}}>
            {["Codice","Etichetta completa","Colore",""].map((h,i)=>(
              <div key={i} className="label" style={{fontSize:9}}>{h}</div>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:240,overflow:"auto",paddingRight:4}}>
            {stations.map((item, i) => (
              <div key={item.id} style={{display:"grid",gridTemplateColumns:"80px 1fr 44px 34px",gap:6,alignItems:"center"}}>
                <input className="input" style={{padding:"4px 7px",fontWeight:700,fontSize:12}} value={item.code} maxLength={8} onChange={e=>updStation(i,{code:e.target.value.toUpperCase()})} placeholder="P1"/>
                <input className="input" style={{padding:"4px 7px",fontSize:12}} value={item.label} onChange={e=>updStation(i,{label:e.target.value})} placeholder="Postazione 1 - Triage"/>
                <ColorPicker value={item.color} onChange={c => updStation(i, { color: c })}/>
                <button className="btn btn-danger btn-sm btn-icon" onClick={()=>setStations(p=>p.filter((_,idx)=>idx!==i))}><Trash2 size={11}/></button>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:10,alignItems:"center"}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setStations(p=>[...p,{id:Date.now(),code:"",label:"",color:"#6ee7b7",sort_order:p.length,is_active:true}])}>
              <Plus size={12}/> Aggiungi
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveStations} disabled={stationSaving}>{stationSaving?<span className="spinner spinner-sm"/>:<Save size={12}/>} Salva tutto</button>
            {stationStatus && <span style={{fontSize:12,color:stationStatus.ok?"var(--accent)":"var(--danger)"}}>{stationStatus.msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
