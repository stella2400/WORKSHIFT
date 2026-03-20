import { useEffect, useState } from "react";
import { Building2, Users, UserPlus, Trash2, Shield, AlertCircle, CheckCircle2, Key, Pencil, X } from "lucide-react";
import { api, apiError, PASSWORD_HINT, validatePasswordClient } from "../api/client";
import { Company, Team, User } from "../types";

type AdminUser = User & { is_active: boolean };

const ROLE_BADGE: Record<string,string> = { manager:"badge-purple", user:"badge-gray" };

export function AdminPanel() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"companies"|"teams"|"users">("companies");

  // Company
  const [companyForm, setCompanyForm] = useState({ name:"", description:"" });
  const [companyStatus, setCompanyStatus] = useState<{ok:boolean;msg:string}|null>(null);

  // Team
  const [teamForm, setTeamForm] = useState({ name:"", description:"", company_id:"" });
  const [teamStatus, setTeamStatus] = useState<{ok:boolean;msg:string}|null>(null);

  // User create
  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState({ full_name:"", employee_code:"", email:"", password:"", company_name:"", team_name:"", role:"user" });
  const [userStatus, setUserStatus] = useState<{ok:boolean;msg:string}|null>(null);
  const [userSaving, setUserSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");

  // User edit modal
  const [editUser, setEditUser] = useState<AdminUser|null>(null);
  const [editForm, setEditForm] = useState({ full_name:"", employee_code:"", email:"", company_name:"", team_name:"", role:"user" });
  const [editStatus, setEditStatus] = useState<{ok:boolean;msg:string}|null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Password reset
  const [resetTarget, setResetTarget] = useState<number|null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetStatus, setResetStatus] = useState<{ok:boolean;msg:string}|null>(null);
  const [resetPwdError, setResetPwdError] = useState("");
  const [actionLoading, setActionLoading] = useState<number|null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminUser|null>(null);

  async function load() {
    setLoading(true);
    try {
      const [c,t,u] = await Promise.all([
        api.get<Company[]>("/admin/companies"),
        api.get<Team[]>("/admin/teams"),
        api.get<AdminUser[]>("/admin/users"),
      ]);
      setCompanies(c.data); setTeams(t.data); setUsers(u.data);
    } catch { /**/ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Filtered teams by selected company in user form
  const userFormCompany = companies.find(c => c.name === userForm.company_name);
  const filteredTeams = userFormCompany ? teams.filter(t => t.company_id === userFormCompany.id) : teams;
  const editFormCompany = companies.find(c => c.name === editForm.company_name);
  const editFilteredTeams = editFormCompany ? teams.filter(t => t.company_id === editFormCompany.id) : teams;

  async function createCompany(e: React.FormEvent) {
    e.preventDefault(); setCompanyStatus(null);
    try { await api.post("/admin/companies", companyForm); setCompanyStatus({ok:true,msg:"Azienda creata"}); setCompanyForm({name:"",description:""}); load(); }
    catch (err) { setCompanyStatus({ok:false,msg:apiError(err)}); }
  }
  async function delCompany(id:number) {
    if (!confirm("Eliminare questa azienda?")) return;
    try { await api.delete(`/admin/companies/${id}`); load(); } catch { /**/ }
  }
  async function createTeam(e: React.FormEvent) {
    e.preventDefault(); setTeamStatus(null);
    try { await api.post("/admin/teams", {...teamForm, company_id: Number(teamForm.company_id)}); setTeamStatus({ok:true,msg:"Team creato con turni predefiniti"}); setTeamForm({name:"",description:"",company_id:""}); load(); }
    catch (err) { setTeamStatus({ok:false,msg:apiError(err)}); }
  }
  async function delTeam(id:number) {
    if (!confirm("Eliminare questo team?")) return;
    try { await api.delete(`/admin/teams/${id}`); load(); } catch { /**/ }
  }
  async function createUser(e: React.FormEvent) {
    e.preventDefault(); setUserStatus(null);
    const pwdErr = validatePasswordClient(userForm.password);
    if (pwdErr) { setPwdError(pwdErr); return; }
    setPwdError(""); setUserSaving(true);
    try {
      await api.post("/admin/users", userForm);
      setUserStatus({ok:true,msg:"Utente creato. Email inviata."}); setShowUserForm(false);
      setUserForm({full_name:"",employee_code:"",email:"",password:"",company_name:"",team_name:"",role:"user"}); load();
    } catch (err) { setUserStatus({ok:false,msg:apiError(err)}); }
    finally { setUserSaving(false); }
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editUser) return; setEditSaving(true); setEditStatus(null);
    try {
      await api.put(`/admin/users/${editUser.id}`, { ...editForm, password: "Placeholder1!" }); // password not changed on edit
      setEditStatus({ok:true,msg:"Dati aggiornati"}); setEditUser(null); load();
    } catch (err) { setEditStatus({ok:false,msg:apiError(err)}); }
    finally { setEditSaving(false); }
  }
  async function resetPassword() {
    if (!resetTarget) return;
    const pwdErr = validatePasswordClient(resetPwd);
    if (pwdErr) { setResetPwdError(pwdErr); return; }
    setResetPwdError(""); setActionLoading(resetTarget); setResetStatus(null);
    try {
      await api.post(`/admin/users/${resetTarget}/reset-password`, {new_password: resetPwd});
      setResetStatus({ok:true,msg:"Password reimpostata. Email inviata."}); setResetTarget(null); setResetPwd(""); load();
    } catch (err) { setResetStatus({ok:false,msg:apiError(err)}); }
    finally { setActionLoading(null); }
  }
  async function toggleUser(u: AdminUser) {
    setActionLoading(u.id);
    try { await api.post(`/admin/users/${u.id}/${u.is_active?"deactivate":"activate"}`); load(); }
    catch { /**/ } finally { setActionLoading(null); }
  }
  async function deleteUser() {
    if (!deleteTarget) return; setActionLoading(deleteTarget.id);
    try { await api.delete(`/admin/users/${deleteTarget.id}`); setDeleteTarget(null); load(); }
    catch { /**/ } finally { setActionLoading(null); }
  }

  const sections = [
    {id:"companies" as const, label:"Aziende", icon:<Building2 size={14}/>, count:companies.length},
    {id:"teams" as const, label:"Team", icon:<Users size={14}/>, count:teams.length},
    {id:"users" as const, label:"Utenti", icon:<Shield size={14}/>, count:users.length},
  ];

  if (loading) return <div style={{display:"flex",justifyContent:"center",padding:48}}><span className="spinner"/></div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      {/* Tabs */}
      <div className="card card-pad" style={{paddingBottom:0}}>
        <div className="label" style={{marginBottom:10}}><Shield size={11} style={{display:"inline",marginRight:5}}/>Pannello di amministrazione</div>
        <div style={{display:"flex",gap:0,borderBottom:"1px solid var(--border)",marginLeft:-22,marginRight:-22,paddingLeft:22}}>
          {sections.map(s => (
            <button key={s.id} onClick={()=>setActiveSection(s.id)}
              style={{display:"flex",alignItems:"center",gap:7,padding:"10px 18px",border:"none",background:"none",cursor:"pointer",
                color:activeSection===s.id?"var(--accent)":"var(--text-2)",
                borderBottom:activeSection===s.id?"2px solid var(--accent)":"2px solid transparent",
                fontWeight:activeSection===s.id?600:400,fontSize:14,marginBottom:-1,transition:"all .15s"}}>
              {s.icon} {s.label}
              <span style={{background:"rgba(255,255,255,.07)",borderRadius:99,padding:"1px 7px",fontSize:11,color:"var(--text-3)"}}>{s.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Companies */}
      {activeSection==="companies" && (
        <div className="card card-pad" style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="heading" style={{fontSize:18}}>Gestione Aziende</div>
          <form onSubmit={createCompany} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,alignItems:"end"}}>
            <div><div className="label" style={{marginBottom:4}}>Nome *</div><input className="input" placeholder="Es. Ospedale San Raffaele" required value={companyForm.name} onChange={e=>setCompanyForm(p=>({...p,name:e.target.value}))}/></div>
            <div><div className="label" style={{marginBottom:4}}>Descrizione</div><input className="input" placeholder="Opzionale" value={companyForm.description} onChange={e=>setCompanyForm(p=>({...p,description:e.target.value}))}/></div>
            <button className="btn btn-primary btn-sm" type="submit"><Building2 size={13}/> Crea</button>
          </form>
          {companyStatus && <div className={`msg ${companyStatus.ok?"msg-success":"msg-error"}`}>{companyStatus.ok?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>}{companyStatus.msg}</div>}
          <div className="table-wrap"><table>
            <thead><tr><th>Nome</th><th>Descrizione</th><th>Creata</th><th/></tr></thead>
            <tbody>{companies.map(c=>(
              <tr key={c.id}><td style={{fontWeight:600}}>{c.name}</td><td className="muted">{c.description||"—"}</td>
                <td className="muted" style={{fontSize:11}}>{new Date(c.created_at).toLocaleDateString("it-IT")}</td>
                <td><button className="btn btn-danger btn-sm btn-icon" onClick={()=>delCompany(c.id)}><Trash2 size={12}/></button></td>
              </tr>
            ))}{!companies.length&&<tr><td colSpan={4} style={{textAlign:"center",color:"var(--text-3)",padding:20}}>Nessuna azienda</td></tr>}</tbody>
          </table></div>
        </div>
      )}

      {/* Teams */}
      {activeSection==="teams" && (
        <div className="card card-pad" style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="heading" style={{fontSize:18}}>Gestione Team</div>
          <form onSubmit={createTeam} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
            <div><div className="label" style={{marginBottom:4}}>Azienda *</div>
              <select className="input" required value={teamForm.company_id} onChange={e=>setTeamForm(p=>({...p,company_id:e.target.value}))}>
                <option value="">Seleziona…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><div className="label" style={{marginBottom:4}}>Nome team *</div><input className="input" placeholder="Es. Pronto Soccorso" required value={teamForm.name} onChange={e=>setTeamForm(p=>({...p,name:e.target.value}))}/></div>
            <div><div className="label" style={{marginBottom:4}}>Descrizione</div><input className="input" placeholder="Opzionale" value={teamForm.description} onChange={e=>setTeamForm(p=>({...p,description:e.target.value}))}/></div>
            <button className="btn btn-primary btn-sm" type="submit"><Users size={13}/> Crea</button>
          </form>
          {teamStatus && <div className={`msg ${teamStatus.ok?"msg-success":"msg-error"}`}>{teamStatus.ok?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>}{teamStatus.msg}</div>}
          <div className="table-wrap"><table>
            <thead><tr><th>Team</th><th>Azienda</th><th>Descrizione</th><th/></tr></thead>
            <tbody>{teams.map(t=>{const co=companies.find(c=>c.id===t.company_id); return(
              <tr key={t.id}><td style={{fontWeight:600}}>{t.name}</td><td className="muted">{co?.name||"—"}</td><td className="muted">{t.description||"—"}</td>
                <td><button className="btn btn-danger btn-sm btn-icon" onClick={()=>delTeam(t.id)}><Trash2 size={12}/></button></td>
              </tr>);})}{!teams.length&&<tr><td colSpan={4} style={{textAlign:"center",color:"var(--text-3)",padding:20}}>Nessun team</td></tr>}</tbody>
          </table></div>
        </div>
      )}

      {/* Users */}
      {activeSection==="users" && (
        <div className="card card-pad" style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="heading" style={{fontSize:18}}>Gestione Utenti</div>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowUserForm(v=>!v)}><UserPlus size={13}/> Crea utente</button>
          </div>
          {userStatus && <div className={`msg ${userStatus.ok?"msg-success":"msg-error"}`}>{userStatus.ok?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>}{userStatus.msg}</div>}

          {showUserForm && (
            <form onSubmit={createUser} className="fade-in" style={{padding:16,borderRadius:"var(--radius-sm)",background:"rgba(110,231,183,.06)",border:"1px solid rgba(110,231,183,.2)",display:"flex",flexDirection:"column",gap:12}}>
              <div className="heading" style={{fontSize:14}}>Nuovo utente</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><div className="label" style={{marginBottom:4}}>Nome e cognome *</div><input className="input" placeholder="Mario Rossi" required value={userForm.full_name} onChange={e=>setUserForm(p=>({...p,full_name:e.target.value}))}/></div>
                <div><div className="label" style={{marginBottom:4}}>Matricola *</div><input className="input" placeholder="MR001" required value={userForm.employee_code} onChange={e=>setUserForm(p=>({...p,employee_code:e.target.value}))}/></div>
                <div><div className="label" style={{marginBottom:4}}>Email *</div><input className="input" type="email" placeholder="mario@esempio.com" required value={userForm.email} onChange={e=>setUserForm(p=>({...p,email:e.target.value}))}/></div>
                <div>
                  <div className="label" style={{marginBottom:4}}>Password temporanea *</div>
                  <input className="input" type="password" placeholder={PASSWORD_HINT} required value={userForm.password} onChange={e=>{setUserForm(p=>({...p,password:e.target.value}));setPwdError("");}}/>
                  {pwdError && <div style={{fontSize:11,color:"var(--danger)",marginTop:3}}>{pwdError}</div>}
                  <div className="muted" style={{fontSize:10,marginTop:3}}>{PASSWORD_HINT}</div>
                </div>
                <div>
                  <div className="label" style={{marginBottom:4}}>Azienda</div>
                  <select className="input" value={userForm.company_name} onChange={e=>setUserForm(p=>({...p,company_name:e.target.value,team_name:""}))}>
                    <option value="">Seleziona azienda…</option>{companies.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="label" style={{marginBottom:4}}>Team</div>
                  <select className="input" value={userForm.team_name} onChange={e=>setUserForm(p=>({...p,team_name:e.target.value}))} disabled={!userForm.company_name}>
                    <option value="">Seleziona team…</option>{filteredTeams.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                <div><div className="label" style={{marginBottom:4}}>Ruolo</div>
                  <select className="input" value={userForm.role} onChange={e=>setUserForm(p=>({...p,role:e.target.value}))}>
                    <option value="user">Utente</option><option value="manager">Manager</option>
                  </select>
                </div>
              </div>
              <div className="muted" style={{fontSize:11}}>L'utente riceverà un'email con la password temporanea.</div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-primary btn-sm" type="submit" disabled={userSaving}>{userSaving?<span className="spinner spinner-sm"/>:<UserPlus size={13}/>} Crea e invia email</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={()=>setShowUserForm(false)}>Annulla</button>
              </div>
            </form>
          )}

          {/* Edit modal */}
          {editUser && (
            <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setEditUser(null);setEditStatus(null);}}}>
              <div className="modal" style={{maxWidth:560}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <div className="heading" style={{fontSize:16}}>Modifica utente</div>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>{setEditUser(null);setEditStatus(null);}}><X size={14}/></button>
                </div>
                <form onSubmit={saveEdit} style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[{l:"Nome e cognome",k:"full_name",p:"Mario Rossi"},{l:"Matricola",k:"employee_code",p:"MR001"},{l:"Email",k:"email",p:"mario@esempio.com",t:"email"}].map(({l,k,p,t})=>(
                      <div key={k}><div className="label" style={{marginBottom:4}}>{l}</div>
                        <input className="input" type={t||"text"} placeholder={p} value={(editForm as Record<string,string>)[k]} onChange={e=>setEditForm(f=>({...f,[k]:e.target.value}))}/></div>
                    ))}
                    <div><div className="label" style={{marginBottom:4}}>Azienda</div>
                      <select className="input" value={editForm.company_name} onChange={e=>setEditForm(f=>({...f,company_name:e.target.value,team_name:""}))}>
                        <option value="">—</option>{companies.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                      </select></div>
                    <div><div className="label" style={{marginBottom:4}}>Team</div>
                      <select className="input" value={editForm.team_name} onChange={e=>setEditForm(f=>({...f,team_name:e.target.value}))} disabled={!editForm.company_name}>
                        <option value="">—</option>{editFilteredTeams.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
                      </select></div>
                    <div><div className="label" style={{marginBottom:4}}>Ruolo</div>
                      <select className="input" value={editForm.role} onChange={e=>setEditForm(f=>({...f,role:e.target.value}))}>
                        <option value="user">Utente</option><option value="manager">Manager</option>
                      </select></div>
                  </div>
                  {editStatus && <div className={`msg ${editStatus.ok?"msg-success":"msg-error"}`}>{editStatus.ok?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>}{editStatus.msg}</div>}
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn btn-primary btn-sm" type="submit" disabled={editSaving}>{editSaving?<span className="spinner spinner-sm"/>:null} Salva</button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={()=>{setEditUser(null);setEditStatus(null);}}>Annulla</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Reset password modal */}
          {resetTarget && (
            <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){setResetTarget(null);setResetPwd("");setResetStatus(null);}}}>
              <div className="modal">
                <div className="heading" style={{fontSize:16,marginBottom:12}}>Reimposta password</div>
                <div className="muted" style={{fontSize:13,marginBottom:12}}>La nuova password temporanea verrà inviata all'utente via email.</div>
                <input className="input" type="password" placeholder={PASSWORD_HINT} value={resetPwd} onChange={e=>{setResetPwd(e.target.value);setResetPwdError("");}} style={{marginBottom:6}}/>
                {resetPwdError && <div style={{fontSize:11,color:"var(--danger)",marginBottom:8}}>{resetPwdError}</div>}
                <div className="muted" style={{fontSize:10,marginBottom:12}}>{PASSWORD_HINT}</div>
                {resetStatus && <div className={`msg ${resetStatus.ok?"msg-success":"msg-error"}`} style={{marginBottom:10}}>{resetStatus.ok?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>}{resetStatus.msg}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btn-primary btn-sm" onClick={resetPassword} disabled={actionLoading===resetTarget}>{actionLoading===resetTarget?<span className="spinner spinner-sm"/>:<Key size={13}/>} Reimposta</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setResetTarget(null);setResetPwd("");setResetStatus(null);}}>Annulla</button>
                </div>
              </div>
            </div>
          )}

          {/* Delete confirm modal */}
          {deleteTarget && (
            <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setDeleteTarget(null);}}>
              <div className="modal">
                <div className="heading" style={{fontSize:16,marginBottom:10}}>Elimina utente</div>
                <p className="muted" style={{marginBottom:16,fontSize:13}}>Stai per eliminare <strong style={{color:"var(--text)"}}>{deleteTarget.full_name}</strong>. Questa azione è irreversibile e rimuoverà tutti i suoi turni.</p>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btn-danger btn-sm" onClick={deleteUser} disabled={actionLoading===deleteTarget.id}>{actionLoading===deleteTarget.id?<span className="spinner spinner-sm"/>:<Trash2 size={13}/>} Elimina definitivamente</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setDeleteTarget(null)}>Annulla</button>
                </div>
              </div>
            </div>
          )}

          <div className="table-wrap"><table>
            <thead><tr><th>Nome</th><th>Email</th><th>Matricola</th><th>Azienda</th><th>Team</th><th>Ruolo</th><th>Stato</th><th>Azioni</th></tr></thead>
            <tbody>{users.map(u=>(
              <tr key={u.id}>
                <td style={{fontWeight:500}}>{u.full_name}{u.must_change_password&&<span style={{marginLeft:6,fontSize:10,color:"var(--warning)"}}>⚠ pwd temp</span>}</td>
                <td className="muted" style={{fontSize:12}}>{u.email}</td>
                <td><code style={{fontSize:11,background:"rgba(255,255,255,.06)",padding:"2px 6px",borderRadius:4}}>{u.employee_code}</code></td>
                <td className="muted" style={{fontSize:12}}>{u.company_name||"—"}</td>
                <td className="muted" style={{fontSize:12}}>{u.team_name||"—"}</td>
                <td><span className={`badge ${ROLE_BADGE[u.role]||"badge-gray"}`} style={{fontSize:10}}>{u.role}</span></td>
                <td><span className={`badge ${u.is_active?"badge-green":"badge-red"}`} style={{fontSize:10}}>{u.is_active?"Attivo":"Disattivato"}</span></td>
                <td>
                  <div style={{display:"flex",gap:4}}>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Modifica" onClick={()=>{setEditUser(u);setEditForm({full_name:u.full_name,employee_code:u.employee_code,email:u.email,company_name:u.company_name||"",team_name:u.team_name||"",role:u.role});setEditStatus(null);}}><Pencil size={12}/></button>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Reimposta password" onClick={()=>{setResetTarget(u.id);setResetStatus(null);setResetPwd("");setResetPwdError("");}}><Key size={12}/></button>
                    <button className={`btn btn-sm ${u.is_active?"btn-warning":"btn-primary"}`} onClick={()=>toggleUser(u)} disabled={actionLoading===u.id} style={{fontSize:11,padding:"4px 8px"}}>{actionLoading===u.id?<span className="spinner spinner-sm"/>:u.is_active?"Disattiva":"Attiva"}</button>
                    <button className="btn btn-danger btn-sm btn-icon" title="Elimina" onClick={()=>setDeleteTarget(u)}><Trash2 size={12}/></button>
                  </div>
                </td>
              </tr>
            ))}{!users.length&&<tr><td colSpan={8} style={{textAlign:"center",color:"var(--text-3)",padding:20}}>Nessun utente</td></tr>}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
