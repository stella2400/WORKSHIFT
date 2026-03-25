import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, X, AlertCircle } from "lucide-react";
import { api, apiError } from "../api/client";
import { DashboardResponse, Shift, SwapDetailRead, User, UserReadShort } from "../types";

type Props = { dashboard: DashboardResponse; currentUser: User; onRefresh: () => void };

const STATUS_LABELS: Record<string,string> = {
  pending_target:"In attesa del collega", pending_manager:"In attesa del manager",
  approved:"Approvato ✓", rejected:"Rifiutato", cancelled:"Annullato",
};
const STATUS_BADGE: Record<string,string> = {
  pending_target:"badge-yellow", pending_manager:"badge-purple",
  approved:"badge-green", rejected:"badge-red", cancelled:"badge-gray",
};

function SwapCard({ swap, currentUser, colorByCode }: { swap: SwapDetailRead; currentUser: User; colorByCode: Record<string,string> }) {
  const isRequester = swap.requester_id === currentUser.id;
  const fmtDate = (d?: string | null) => d ? new Date(d+"T12:00:00").toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit"}) : "—";

  return (
    <div style={{ padding:"12px 16px", borderRadius:"var(--radius-sm)", background:"rgba(255,255,255,.04)", border:"1px solid var(--border)" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
          <ArrowLeftRight size={15} color="var(--text-3)" style={{ flexShrink:0, marginTop:3 }}/>
          <div>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>
              {isRequester ? `Richiesta a ${swap.target_name}` : `Richiesta da ${swap.requester_name}`}
              <span className="muted" style={{ marginLeft:8, fontSize:11, fontWeight:400 }}>#{swap.id}</span>
            </div>
            {/* Shift details */}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:4 }}>
              <div style={{ fontSize:12, padding:"3px 10px", borderRadius:99, background:`${colorByCode[swap.requester_shift_code]||"#475569"}20`, border:`1px solid ${colorByCode[swap.requester_shift_code]||"#475569"}40`, color:colorByCode[swap.requester_shift_code]||"var(--text)" }}>
                {fmtDate(swap.requester_shift_date)} · <strong>{swap.requester_shift_code}</strong> {swap.requester_shift_label}
                <span className="muted" style={{ marginLeft:4, fontSize:10 }}>({swap.requester_name})</span>
              </div>
              <ArrowLeftRight size={12} style={{ alignSelf:"center", color:"var(--text-3)" }}/>
              <div style={{ fontSize:12, padding:"3px 10px", borderRadius:99, background:`${colorByCode[swap.target_shift_code]||"#475569"}20`, border:`1px solid ${colorByCode[swap.target_shift_code]||"#475569"}40`, color:colorByCode[swap.target_shift_code]||"var(--text)" }}>
                {fmtDate(swap.target_shift_date)} · <strong>{swap.target_shift_code}</strong> {swap.target_shift_label}
                <span className="muted" style={{ marginLeft:4, fontSize:10 }}>({swap.target_name})</span>
              </div>
            </div>
            {swap.requester_note && <div className="muted" style={{ fontSize:11, fontStyle:"italic" }}>"{swap.requester_note}"</div>}
            {swap.target_note && <div className="muted" style={{ fontSize:11 }}>Risposta: "{swap.target_note}"</div>}
            {swap.manager_note && <div style={{ fontSize:11, color:"var(--accent-2)" }}>Manager: "{swap.manager_note}"</div>}
          </div>
        </div>
        <span className={`badge ${STATUS_BADGE[swap.status]||"badge-gray"}`} style={{ fontSize:10, flexShrink:0 }}>
          {STATUS_LABELS[swap.status]||swap.status}
        </span>
      </div>
    </div>
  );
}

export function SwapView({ dashboard, currentUser, onRefresh }: Props) {
  const [swaps, setSwaps] = useState<SwapDetailRead[]>([]);
  const [pendingMgr, setPendingMgr] = useState<SwapDetailRead[]>([]);
  const [colleagues, setColleagues] = useState<UserReadShort[]>([]);
  const [colleagueShifts, setColleagueShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number|null>(null);
  const [note, setNote] = useState<Record<number,string>>({});
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ target_id:"", my_shift_id:"", their_shift_id:"", note:"" });
  const [newError, setNewError] = useState("");
  const [newLoading, setNewLoading] = useState(false);
  const isManager = currentUser.role === "manager";
  const colorByCode = Object.fromEntries(dashboard.definitions.map(d=>[d.code,d.color]));

  async function load() {
    setLoading(true);
    try {
      const [swapRes, colRes] = await Promise.all([
        api.get<SwapDetailRead[]>("/swaps"),
        api.get<UserReadShort[]>("/team/colleagues"),
      ]);
      setSwaps(swapRes.data); setColleagues(colRes.data);
      if (isManager) {
        const mRes = await api.get<SwapDetailRead[]>("/swaps/pending-manager");
        setPendingMgr(mRes.data);
      }
    } catch { /**/ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!newForm.target_id) { setColleagueShifts([]); return; }
    api.get<Shift[]>(`/team/colleague-shifts/${newForm.target_id}`)
      .then(r => setColleagueShifts(r.data)).catch(() => setColleagueShifts([]));
  }, [newForm.target_id]);

  async function targetAction(swapId:number, action:"accept"|"reject") {
    setActionLoading(swapId);
    try { await api.post(`/swaps/${swapId}/target-action`, {action, note:note[swapId]||null}); await load(); onRefresh(); }
    catch { /**/ } finally { setActionLoading(null); }
  }
  async function managerAction(swapId:number, action:"approve"|"reject") {
    setActionLoading(swapId);
    try { await api.post(`/swaps/${swapId}/manager-action`, {action, note:note[swapId]||null}); await load(); onRefresh(); }
    catch { /**/ } finally { setActionLoading(null); }
  }
  async function createSwap(e:React.FormEvent) {
    e.preventDefault(); setNewError(""); setNewLoading(true);
    try {
      await api.post("/swaps", { target_id:Number(newForm.target_id), requester_shift_id:Number(newForm.my_shift_id), target_shift_id:Number(newForm.their_shift_id), requester_note:newForm.note||null });
      setShowNew(false); setNewForm({target_id:"",my_shift_id:"",their_shift_id:"",note:""}); await load();
    } catch (err) { setNewError(apiError(err)); }
    finally { setNewLoading(false); }
  }

  function shiftLabel(id:number, arr:Shift[]) {
    const s=arr.find(x=>x.id===id);
    if(!s) return `#${id}`;
    return `${new Date(s.shift_date+"T12:00:00").toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit"})} · ${s.shift_code} (${s.shift_label})`;
  }

  const myShifts = dashboard.shifts;
  const targetColleague = colleagues.find(c=>String(c.id)===newForm.target_id);
  const needsAction = swaps.filter(s=>s.target_id===currentUser.id && s.status==="pending_target");

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

      {/* Manager: pending approvals */}
      {isManager && pendingMgr.length>0 && (
        <div className="card card-pad">
          <div className="label" style={{ marginBottom:4 }}>Da approvare</div>
          <h2 className="heading" style={{ fontSize:18, marginBottom:12 }}>Richieste in attesa del manager</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {pendingMgr.map(swap=>(
              <div key={swap.id} style={{ padding:"12px 14px", borderRadius:"var(--radius-sm)", background:"rgba(129,140,248,.08)", border:"1px solid rgba(129,140,248,.2)" }}>
                <SwapCard swap={swap} currentUser={currentUser} colorByCode={colorByCode}/>
                <div style={{ display:"flex", gap:8, marginTop:10, alignItems:"center" }}>
                  <input className="input" style={{ maxWidth:200, padding:"4px 8px", fontSize:11 }} placeholder="Nota manager (opzionale)"
                    value={note[swap.id]||""} onChange={e=>setNote(p=>({...p,[swap.id]:e.target.value}))}/>
                  <button className="btn btn-primary btn-sm" onClick={()=>managerAction(swap.id,"approve")} disabled={actionLoading===swap.id}>
                    {actionLoading===swap.id?<span className="spinner spinner-sm"/>:<Check size={12}/>} Approva
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={()=>managerAction(swap.id,"reject")} disabled={actionLoading===swap.id}>
                    <X size={12}/> Rifiuta
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My swaps */}
      <div className="card card-pad">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div className="label">Cambi turno</div>
            <h2 className="heading" style={{ fontSize:20, marginTop:4 }}>Le mie richieste</h2>
          </div>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowNew(v=>!v)}>
            <ArrowLeftRight size={13}/> Nuova richiesta
          </button>
        </div>

        {/* New swap form */}
        {showNew && (
          <form onSubmit={createSwap} className="fade-in" style={{ padding:14, borderRadius:"var(--radius-sm)", background:"rgba(110,231,183,.06)", border:"1px solid rgba(110,231,183,.2)", marginBottom:14, display:"flex", flexDirection:"column", gap:12 }}>
            <div className="heading" style={{ fontSize:14 }}>Nuova richiesta di cambio turno</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Collega *</div>
                <select className="input" required value={newForm.target_id} onChange={e=>setNewForm(p=>({...p,target_id:e.target.value,their_shift_id:""}))}>
                  <option value="">Seleziona collega…</option>
                  {colleagues.map(c=><option key={c.id} value={c.id}>{c.full_name} ({c.employee_code})</option>)}
                </select>
              </div>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Il mio turno da cedere *</div>
                <select className="input" required value={newForm.my_shift_id} onChange={e=>setNewForm(p=>({...p,my_shift_id:e.target.value}))}>
                  <option value="">Seleziona…</option>
                  {myShifts.map(s=><option key={s.id} value={s.id}>{shiftLabel(s.id,myShifts)}</option>)}
                </select>
              </div>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Turno di {targetColleague?.full_name||"collega"} da ricevere *</div>
                <select className="input" required value={newForm.their_shift_id} onChange={e=>setNewForm(p=>({...p,their_shift_id:e.target.value}))} disabled={!newForm.target_id}>
                  <option value="">Seleziona…</option>
                  {colleagueShifts.map(s=><option key={s.id} value={s.id}>{shiftLabel(s.id,colleagueShifts)}</option>)}
                </select>
                {newForm.target_id && !colleagueShifts.length && <div className="muted" style={{ fontSize:11, marginTop:3 }}>Nessun turno trovato per questo collega.</div>}
              </div>
              <div>
                <div className="label" style={{ marginBottom:4 }}>Nota (opzionale)</div>
                <input className="input" placeholder="Motivo del cambio" value={newForm.note} onChange={e=>setNewForm(p=>({...p,note:e.target.value}))}/>
              </div>
            </div>
            {newError && <div className="msg msg-error"><AlertCircle size={13}/>{newError}</div>}
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn btn-primary btn-sm" type="submit" disabled={newLoading}>{newLoading?<span className="spinner spinner-sm"/>:<ArrowLeftRight size={13}/>} Invia</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={()=>setShowNew(false)}>Annulla</button>
            </div>
          </form>
        )}

        {/* Actions needed first */}
        {needsAction.length>0 && (
          <div style={{ marginBottom:14 }}>
            <div className="label" style={{ marginBottom:8, color:"var(--warning)" }}>⚠ Richieste che attendono la tua risposta</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {needsAction.map(swap=>(
                <div key={swap.id} style={{ padding:"12px 14px", borderRadius:"var(--radius-sm)", background:"rgba(251,191,36,.08)", border:"1px solid rgba(251,191,36,.25)" }}>
                  <SwapCard swap={swap} currentUser={currentUser} colorByCode={colorByCode}/>
                  <div style={{ display:"flex", gap:6, marginTop:10, alignItems:"center" }}>
                    <input className="input" style={{ maxWidth:180, padding:"4px 7px", fontSize:11 }} placeholder="Nota (opzionale)"
                      value={note[swap.id]||""} onChange={e=>setNote(p=>({...p,[swap.id]:e.target.value}))}/>
                    <button className="btn btn-primary btn-sm" onClick={()=>targetAction(swap.id,"accept")} disabled={actionLoading===swap.id}>
                      {actionLoading===swap.id?<span className="spinner spinner-sm"/>:<Check size={12}/>} Accetta
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={()=>targetAction(swap.id,"reject")} disabled={actionLoading===swap.id}>
                      <X size={12}/> Rifiuta
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display:"flex", justifyContent:"center", padding:24 }}><span className="spinner"/></div>
        ) : swaps.filter(s=>s.status!=="pending_target"||s.requester_id===currentUser.id).length===0 ? (
          <div className="empty-state"><ArrowLeftRight size={28}/><div>Nessun cambio turno</div></div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {swaps.filter(s=>!(s.target_id===currentUser.id&&s.status==="pending_target")).map(swap=>(
              <SwapCard key={swap.id} swap={swap} currentUser={currentUser} colorByCode={colorByCode}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
