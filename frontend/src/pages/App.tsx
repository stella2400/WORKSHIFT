import { useEffect, useState } from "react";
import { api, bootAuthToken, setAuthToken } from "../api/client";
import { DashboardResponse, User } from "../types";
import { AuthView } from "../components/AuthView";
import { ShiftWheel } from "../components/ShiftWheel";
import { ImportPanel } from "../components/ImportPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import { EditableDayTable } from "../components/EditableDayTable";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);

  async function loadDashboard() {
    const { data } = await api.get<DashboardResponse>("/dashboard/me");
    setDashboard(data);
    setUser(data.user);
  }

  useEffect(() => {
    const token = bootAuthToken();
    if (token) {
      loadDashboard().catch(() => setAuthToken(null));
    }
  }, []);

  if (!user || !dashboard) {
    return <AuthView onLogin={(loggedUser) => { setUser(loggedUser); loadDashboard(); }} />;
  }

  return (
    <div className="page" style={{display:'grid',gap:24}}>
      <div className="card" style={{padding:24,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{display:'inline-flex',padding:'6px 12px',borderRadius:999,background:'rgba(34,211,238,.12)',color:'#67e8f9',fontWeight:700}}>WORKSHIFT</div>
          <h1 style={{margin:'14px 0 8px'}}>Ciao {user.full_name}</h1>
          <div style={{color:'#94a3b8'}}>Software turni multi-settore, configurabile per qualsiasi ambiente lavorativo.</div>
        </div>
        <button className="button secondary" onClick={() => { setAuthToken(null); setUser(null); setDashboard(null); }}>Esci</button>
      </div>

      <div className="stats">
        <div className="card" style={{padding:20}}><strong>{dashboard.summary.total_days}</strong><div>Giorni registrati</div></div>
        <div className="card" style={{padding:20}}><strong>{dashboard.summary.work_days}</strong><div>Giorni lavorativi</div></div>
        <div className="card" style={{padding:20}}><strong>{dashboard.summary.off_days}</strong><div>Riposi o stop</div></div>
        <div className="card" style={{padding:20}}><strong>{dashboard.summary.uploads_count}</strong><div>Import effettuati</div></div>
      </div>

      <div className="grid grid-2">
        <ShiftWheel dashboard={dashboard} />
        <ImportPanel onDone={loadDashboard} />
      </div>

      <div className="grid grid-2">
        <EditableDayTable dashboard={dashboard} onRefresh={loadDashboard} />
        <SettingsPanel />
      </div>
    </div>
  );
}
