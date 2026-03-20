import { useEffect, useState } from "react";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { api, setAuthToken, apiError, PASSWORD_HINT, validatePasswordClient } from "../api/client";
import { User } from "../types";

type Props = { onLogin: (user: User) => void; initialToken?: string | null };
type Mode = "login" | "register" | "forgot" | "reset";

export function AuthView({ onLogin, initialToken }: Props) {
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>(initialToken ? "reset" : "login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [form, setForm] = useState({ full_name:"", employee_code:"", company_name:"", team_name:"", email:"", password:"" });
  const [forgotEmail, setForgotEmail] = useState(""); const [forgotCode, setForgotCode] = useState("");
  const [newPassword, setNewPassword] = useState(""); const [newPwdError, setNewPwdError] = useState("");

  useEffect(() => {
    api.get<{ open: boolean }>("/auth/registration-open")
      .then(r => setRegistrationOpen(r.data.open))
      .catch(() => setRegistrationOpen(false));
  }, []);

  function set(k: keyof typeof form) { return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f=>({...f,[k]:e.target.value})); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSuccess(""); setLoading(true); setPwdError(""); setNewPwdError("");
    try {
      if (mode==="login") {
        const { data } = await api.post("/auth/login", {email:form.email,password:form.password});
        setAuthToken(data.access_token); onLogin(data.user);
      } else if (mode==="register") {
        const pwdErr = validatePasswordClient(form.password);
        if (pwdErr) { setPwdError(pwdErr); setLoading(false); return; }
        const { data } = await api.post("/auth/register", {full_name:form.full_name,employee_code:form.employee_code,email:form.email,password:form.password,company_name:form.company_name||undefined,team_name:form.team_name||undefined});
        setAuthToken(data.access_token); onLogin(data.user);
      } else if (mode==="forgot") {
        await api.post("/auth/forgot-password", {email:forgotEmail,employee_code:forgotCode});
        setSuccess("Se i dati sono corretti riceverai un'email a breve.");
      } else if (mode==="reset") {
        const pwdErr = validatePasswordClient(newPassword);
        if (pwdErr) { setNewPwdError(pwdErr); setLoading(false); return; }
        await api.post("/auth/reset-password", {token:initialToken,new_password:newPassword});
        setSuccess("Password aggiornata!"); setTimeout(()=>setMode("login"),2000);
      }
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">WorkShift</div>
        <div className="card card-pad-lg" style={{display:"flex",flexDirection:"column",gap:20}}>
          <div>
            <h1 className="display" style={{fontSize:26,marginBottom:6}}>
              {mode==="login"&&"Bentornato"}{mode==="register"&&"Crea account"}
              {mode==="forgot"&&"Recupera password"}{mode==="reset"&&"Nuova password"}
            </h1>
            <p className="muted" style={{fontSize:13}}>
              {mode==="login"&&"Accedi per gestire i tuoi turni."}
              {mode==="register"&&"Compila i campi per creare il tuo profilo."}
              {mode==="forgot"&&"Inserisci email e matricola."}{mode==="reset"&&"Scegli una nuova password sicura."}
            </p>
          </div>

          {/* Show register tab only if registration is open */}
          {(mode==="login"||mode==="register") && registrationOpen && (
            <div style={{display:"flex",gap:4,background:"rgba(255,255,255,.04)",padding:3,borderRadius:10,border:"1px solid var(--border)"}}>
              {(["login","register"] as Mode[]).map(m=>(
                <button key={m} onClick={()=>{setMode(m);setError("");setSuccess("");setPwdError("");}}
                  style={{flex:1,padding:"7px 0",borderRadius:7,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,
                    background:mode===m?"var(--bg-3)":"transparent",color:mode===m?"var(--text)":"var(--text-2)",
                    boxShadow:mode===m?"0 2px 8px rgba(0,0,0,.3)":"none",transition:"all .15s"}}>
                  {m==="login"?"Accedi":"Registrati"}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:11}}>
            {mode==="register"&&(
              <>
                <div><div className="label" style={{marginBottom:4}}>Nome e cognome *</div><input className="input" placeholder="Mario Rossi" value={form.full_name} onChange={set("full_name")} required/></div>
                <div><div className="label" style={{marginBottom:4}}>Matricola *</div><input className="input" placeholder="MR001" value={form.employee_code} onChange={set("employee_code")} required/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><div className="label" style={{marginBottom:4}}>Azienda</div><input className="input" placeholder="Ospedale X" value={form.company_name} onChange={set("company_name")}/></div>
                  <div><div className="label" style={{marginBottom:4}}>Team</div><input className="input" placeholder="Pronto Soccorso" value={form.team_name} onChange={set("team_name")}/></div>
                </div>
                <div className="divider" style={{margin:"2px 0"}}/>
              </>
            )}
            {(mode==="login"||mode==="register")&&(
              <>
                <div><div className="label" style={{marginBottom:4}}>Email *</div><input className="input" type="email" placeholder="mario@example.com" value={form.email} onChange={set("email")} required/></div>
                <div>
                  <div className="label" style={{marginBottom:4}}>Password *</div>
                  <div style={{position:"relative"}}>
                    <input className="input" type={showPwd?"text":"password"} placeholder={mode==="register"?"Min. 8 car., 1 maiuscola, 1 numero, 1 speciale":"••••••••"} value={form.password} onChange={e=>{set("password")(e);setPwdError("");}} required style={{paddingRight:40}}/>
                    <button type="button" onClick={()=>setShowPwd(v=>!v)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"var(--text-3)",cursor:"pointer"}}>{showPwd?<EyeOff size={15}/>:<Eye size={15}/>}</button>
                  </div>
                  {pwdError&&<div style={{fontSize:11,color:"var(--danger)",marginTop:3}}>{pwdError}</div>}
                  {mode==="register"&&!pwdError&&<div className="muted" style={{fontSize:10,marginTop:2}}>{PASSWORD_HINT}</div>}
                </div>
                {mode==="login"&&<button type="button" onClick={()=>{setMode("forgot");setError("");}} className="muted" style={{background:"none",border:"none",cursor:"pointer",textAlign:"right",fontSize:12}}>Password dimenticata?</button>}
              </>
            )}
            {mode==="forgot"&&(
              <>
                <div><div className="label" style={{marginBottom:4}}>Email</div><input className="input" type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} required/></div>
                <div><div className="label" style={{marginBottom:4}}>Matricola</div><input className="input" value={forgotCode} onChange={e=>setForgotCode(e.target.value)} required/></div>
              </>
            )}
            {mode==="reset"&&(
              <div>
                <div className="label" style={{marginBottom:4}}>Nuova password *</div>
                <input className="input" type="password" placeholder={PASSWORD_HINT} value={newPassword} onChange={e=>{setNewPassword(e.target.value);setNewPwdError("");}} required/>
                {newPwdError&&<div style={{fontSize:11,color:"var(--danger)",marginTop:3}}>{newPwdError}</div>}
                <div className="muted" style={{fontSize:10,marginTop:2}}>{PASSWORD_HINT}</div>
              </div>
            )}
            {error&&<div className="msg msg-error"><AlertCircle size={14}/>{error}</div>}
            {success&&<div className="msg msg-success">{success}</div>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{marginTop:4}}>
              {loading&&<span className="spinner spinner-sm"/>}
              {mode==="login"&&"Accedi"}{mode==="register"&&"Crea account"}
              {mode==="forgot"&&"Invia link di reset"}{mode==="reset"&&"Aggiorna password"}
            </button>
            {(mode==="forgot"||mode==="reset")&&<button type="button" onClick={()=>{setMode("login");setError("");setSuccess("");}} className="btn btn-ghost">← Torna al login</button>}
          </form>
        </div>
      </div>
    </div>
  );
}
