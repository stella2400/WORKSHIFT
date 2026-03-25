import { useEffect, useState } from "react";
import { LayoutDashboard, Calendar, Upload, ArrowLeftRight, Settings, LogOut, Users } from "lucide-react";
import { api, bootAuthToken, setAuthToken, apiError } from "../api/client";
import { DashboardResponse, SwapDetailRead, User, UserReadShort } from "../types";
import { AuthView } from "../components/AuthView";
import { TodayBanner } from "../components/TodayBanner";
import { DashboardCards } from "../components/DashboardCards";
import { CalendarView } from "../components/CalendarView";
import { EditableDayTable } from "../components/EditableDayTable";
import { ImportPanel } from "../components/ImportPanel";
import { SwapView } from "../components/SwapView";
import { SettingsPanel } from "../components/SettingsPanel";
import { AdminPanel } from "../components/AdminPanel";
import { UploadsHistory } from "../components/UploadsHistory";
import { TeamShiftsPanel } from "../components/TeamShiftsPanel";

type Tab = "dashboard"|"calendar"|"upload"|"team"|"swaps"|"settings"|"admin";

export default function App() {
  const [user, setUser] = useState<User|null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse|null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [loadError, setLoadError] = useState("");
  const [swapCount, setSwapCount] = useState(0);
  const [mgrSwapCount, setMgrSwapCount] = useState(0);
  const [teamMembers, setTeamMembers] = useState<UserReadShort[]>([]);

  const [selectedMonth, setSelectedMonth] = useState<{year:number;month:number}|null>(null);
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get("token");

  async function loadDashboard() {
    setLoadError("");
    try {
      const { data } = await api.get<DashboardResponse>("/dashboard/me");
      setDashboard(data); setUser(data.user);
    } catch (err) { setLoadError(apiError(err)); }
  }

  async function loadTeamMembers() {
    try { const { data } = await api.get<UserReadShort[]>("/manager/team"); setTeamMembers(data); }
    catch { setTeamMembers([]); }
  }

  async function loadSwapCounts(u: User) {
    try {
      const { data } = await api.get<SwapDetailRead[]>("/swaps");
      setSwapCount(data.filter(s => s.status==="pending_target" && s.target_id===u.id).length);
      if (u.role==="manager") {
        const { data: mgr } = await api.get<SwapDetailRead[]>("/swaps/pending-manager");
        setMgrSwapCount(mgr.length);
      }
    } catch { /**/ }
  }

  useEffect(() => {
    const token = bootAuthToken();
    if (token) {
      api.get<User>("/users/me").then(r => {
        const u = r.data; setUser(u);
        if (u.role==="admin") setTab("admin");
        else { setTab("dashboard"); loadDashboard(); }
      }).catch(() => setAuthToken(null));
    }
  }, []);

  useEffect(() => {
    if (user && user.role!=="admin") {
      loadSwapCounts(user);
      if (user.role==="manager") loadTeamMembers();
    }
  }, [user?.id, tab]);

  function handleLogin(u: User) {
    setUser(u);
    if (u.role==="admin") setTab("admin");
    else { setTab("dashboard"); loadDashboard(); }
  }

  function logout() {
    setAuthToken(null); setUser(null); setDashboard(null);
    setTab("dashboard"); setSwapCount(0); setMgrSwapCount(0);
  }

  if (resetToken && !user) return <AuthView onLogin={handleLogin} initialToken={resetToken}/>;
  if (!user) return <AuthView onLogin={handleLogin}/>;

  // Admin
  if (user.role==="admin") return (
    <div className="app-shell fade-in">
      <div className="card">
        <div className="topbar">
          {/* Riga 1: logo sx + user+logout dx */}
          <div className="topbar-top-row">
            <div className="topbar-logo">WorkShift</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, fontWeight:600, lineHeight:1.2 }}>{user.full_name}</div>
                <div className="muted" style={{ fontSize:10 }}>Amministratore</div>
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={logout}><LogOut size={14}/></button>
            </div>
          </div>
        </div>
      </div>
      <AdminPanel/>
    </div>
  );

  if (user.must_change_password && tab!=="settings") setTimeout(() => setTab("settings"), 50);
  const isManager = user.role==="manager";
  const totalBadge = swapCount + mgrSwapCount;

  type NavItem = { id: Tab; label: string; icon: React.ReactNode; badge?: number };
  const navItems: NavItem[] = [
    { id:"dashboard", label:"Dashboard",   icon:<LayoutDashboard size={13}/> },
    { id:"calendar",  label:"Calendario",  icon:<Calendar size={13}/> },
    ...(isManager ? [
      { id:"upload" as Tab, label:"Carica Turni", icon:<Upload size={13}/> },
      { id:"team"   as Tab, label:"Il mio team",  icon:<Users size={13}/> },
    ] : []),
    { id:"swaps",    label:"Cambi Turno",  icon:<ArrowLeftRight size={13}/>, badge: totalBadge },
    { id:"settings", label:"Impostazioni", icon:<Settings size={13}/> },
  ];

  return (
    <div className="app-shell fade-in">
      {user.must_change_password && (
        <div className="msg msg-warning" style={{ borderRadius:"var(--radius-lg)" }}>
          ⚠ Password temporanea. Vai in <strong>Impostazioni</strong>.
        </div>
      )}

      {/* Topbar */}
      <div className="card">
        <div className="topbar">
          {/* Riga 1: logo sx + user+logout dx */}
          <div className="topbar-top-row">
            <div className="topbar-logo">WorkShift</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, fontWeight:600, lineHeight:1.2 }}>{user.full_name}</div>
                <div className="muted" style={{ fontSize:10 }}>{user.employee_code} · {user.role}</div>
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={logout}><LogOut size={14}/></button>
            </div>
          </div>
          {/* Riga 2: nav scrollabile */}
          <nav className="nav">
            {navItems.map(item => (
              <button key={item.id} className={`nav-item${tab===item.id?" active":""}`} onClick={() => setTab(item.id)}>
                {item.icon} {item.label}
                {item.badge ? <span className="notif-dot"/> : null}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {loadError && <div className="msg msg-error">{loadError}</div>}

      {/* Dashboard */}
      {tab==="dashboard" && dashboard && (
        <>
          <TodayBanner dashboard={dashboard} userName={user.full_name}/>
          <DashboardCards dashboard={dashboard} currentUser={user} selectedMonth={selectedMonth}
            onUserUpdate={u => { setUser(u); setDashboard(d => d ? {...d, user:u} : d); }}/>
          <CalendarView dashboard={dashboard} sideDetail={true} onMonthChange={(y,m)=>setSelectedMonth({year:y,month:m})}/>
        </>
      )}
      {tab==="dashboard" && !dashboard && (
        <div style={{ display:"flex", justifyContent:"center", padding:48 }}><span className="spinner"/></div>
      )}

      {/* Calendar */}
      {tab==="calendar" && dashboard && (
        <div className="grid-2 grid-2-asym">
          <CalendarView dashboard={dashboard} sideDetail={false} onMonthChange={(y,m)=>setSelectedMonth({year:y,month:m})}/>
          <EditableDayTable dashboard={dashboard} onRefresh={loadDashboard} selectedMonth={selectedMonth}/>
        </div>
      )}

      {/* Upload */}
      {tab==="upload" && isManager && (
        <div className="grid-2">
          <ImportPanel onDone={loadDashboard} currentUser={user} teamMembers={teamMembers}/>
          <UploadsHistory uploads={dashboard?.uploads || []}/>
        </div>
      )}

      {/* Team */}
      {tab==="team" && isManager && dashboard && (
        <TeamShiftsPanel
          currentUser={user}
          definitions={dashboard.definitions}
          stationDefs={dashboard.station_definitions}
          standardHours={dashboard.team_config?.standard_hours ?? 6}
          onRefresh={loadDashboard}
        />
      )}

      {/* Swaps */}
      {tab==="swaps" && dashboard && (
        <SwapView dashboard={dashboard} currentUser={user}
          onRefresh={() => { loadDashboard(); if (user) loadSwapCounts(user); }}/>
      )}

      {/* Settings */}
      {tab==="settings" && (
        <SettingsPanel currentUser={user}
          onUserUpdate={u => { setUser(u); setDashboard(d => d ? {...d, user:u} : d); }}
          onRefresh={loadDashboard}/>
      )}
    </div>
  );
}
