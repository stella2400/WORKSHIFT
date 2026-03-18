import { useState } from "react";
import { api, setAuthToken } from "../api/client";
import { User } from "../types";

type Props = { onLogin: (user: User) => void };

export function AuthView({ onLogin }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    employee_code: "",
    company_name: "",
    team_name: "",
    email: "",
    password: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login"
        ? { email: form.email, password: form.password }
        : form;
      const { data } = await api.post(url, payload);
      setAuthToken(data.access_token);
      onLogin(data.user);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Operazione non riuscita");
    }
  }

  return (
    <div className="page" style={{display:"grid", minHeight:"100vh", alignItems:"center"}}>
      <div className="grid grid-2">
        <div className="card" style={{padding:32}}>
          <div style={{display:"inline-flex",padding:"8px 14px",borderRadius:999,background:"rgba(34,211,238,.12)",color:"#67e8f9",fontWeight:700,letterSpacing:1}}>WORKSHIFT</div>
          <h1 style={{fontSize:56,lineHeight:1.05,margin:"18px 0"}}>I tuoi turni, per qualunque lavoro.</h1>
          <p style={{fontSize:22,color:"#cbd5e1",maxWidth:700}}>Configuri i codici del tuo ambiente, importi file Excel, PDF o Word e gestisci ogni giorno con una dashboard chiara e moderna.</p>
        </div>
        <form className="card" onSubmit={submit} style={{padding:28, display:"grid", gap:14}}>
          <div style={{display:"flex", gap:10}}>
            <button type="button" className="button secondary" onClick={() => setMode("login")} style={{flex:1, opacity:mode==="login"?1:.7}}>Accedi</button>
            <button type="button" className="button secondary" onClick={() => setMode("register")} style={{flex:1, opacity:mode==="register"?1:.7}}>Registrati</button>
          </div>
          {mode === "register" && (
            <>
              <input className="input" placeholder="Nome e cognome" value={form.full_name} onChange={(e)=>setForm({...form, full_name:e.target.value})} />
              <input className="input" placeholder="Matricola o codice dipendente" value={form.employee_code} onChange={(e)=>setForm({...form, employee_code:e.target.value})} />
              <input className="input" placeholder="Azienda" value={form.company_name} onChange={(e)=>setForm({...form, company_name:e.target.value})} />
              <input className="input" placeholder="Team / reparto" value={form.team_name} onChange={(e)=>setForm({...form, team_name:e.target.value})} />
            </>
          )}
          <input className="input" placeholder="Email" value={form.email} onChange={(e)=>setForm({...form, email:e.target.value})} />
          <input className="input" type="password" placeholder="Password" value={form.password} onChange={(e)=>setForm({...form, password:e.target.value})} />
          <button className="button" type="submit">{mode === "login" ? "Accedi" : "Crea account"}</button>
          {error && <div style={{color:'#fca5a5'}}>{error}</div>}
        </form>
      </div>
    </div>
  );
}
