import { useState } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, Users, Image, UserCheck, MapPin } from "lucide-react";
import { api, apiError } from "../api/client";
import { BulkImportResponse, User, UserReadShort } from "../types";

type Mode = "bulk" | "single" | "stations";
type Props = { onDone: () => void; currentUser: User; teamMembers: UserReadShort[] };

export function ImportPanel({ onDone, currentUser, teamMembers }: Props) {
  const [mode, setMode] = useState<Mode>("bulk");
  const [file, setFile] = useState<File | null>(null);
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResponse | null>(null);
  const [singleMsg, setSingleMsg] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const isImage = file && /\.(png|jpe?g|webp)$/i.test(file.name);

  async function submit() {
    if (!file) return;
    if (mode === "single" && !targetUserId) { setError("Seleziona un utente"); return; }
    setLoading(true); setBulkResult(null); setSingleMsg(""); setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const headers = { "Content-Type": "multipart/form-data" };
      if (mode === "bulk") {
        const { data } = await api.post<BulkImportResponse>("/imports/team", form, { headers });
        setBulkResult(data);
      } else if (mode === "single") {
        const { data } = await api.post(`/imports/user/${targetUserId}`, form, { headers });
        setSingleMsg(`Import completato: ${data.month_label}`);
      } else {
        const { data } = await api.post<BulkImportResponse>("/imports/stations", form, { headers });
        setBulkResult(data);
      }
      setFile(null); onDone();
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }

  const modes: { id: Mode; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: "bulk", label: "Turni team", icon: <Users size={13} />, desc: "Importa turni di tutto il team da un file" },
    { id: "single", label: "Utente + AI", icon: <Image size={13} />, desc: "File o immagine per singolo utente (AI)" },
    { id: "stations", label: "Postazioni", icon: <MapPin size={13} />, desc: "Importa postazioni di lavoro del team" },
  ];

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="label">Importa</div>
        <h2 className="heading" style={{ fontSize: 20, marginTop: 4 }}>Carica file turni</h2>
      </div>

      {/* Mode selector */}
      <div style={{ display: "flex", gap: 4 }} className="import-mode-btns">
        {modes.map(m => (
          <button key={m.id} className={`btn btn-sm ${mode === m.id ? "btn-primary" : "btn-ghost"}`}
            style={{ flex: 1, flexDirection: "column", gap: 3, height: "auto", padding: "8px 6px" }}
            onClick={() => { setMode(m.id); setFile(null); setError(""); setBulkResult(null); setSingleMsg(""); }}>
            {m.icon}
            <span style={{ fontSize: 11 }}>{m.label}</span>
          </button>
        ))}
      </div>

      <div className="muted" style={{ fontSize: 11, padding: "7px 10px", background: "rgba(255,255,255,.04)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
        {modes.find(m => m.id === mode)?.desc}
        {mode === "stations" && <span> · Formato: matricola + codice postazione per ogni giorno</span>}
      </div>

      {mode === "single" && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Utente</div>
          <select className="input" value={targetUserId} onChange={e => setTargetUserId(e.target.value)}>
            <option value="">Seleziona utente del team…</option>
            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.employee_code})</option>)}
          </select>
        </div>
      )}

      {/* Dropzone */}
      <div className={`dropzone${dragOver ? " drag-over" : ""}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
        onClick={() => document.getElementById("ws-import-v7")?.click()}>
        <input id="ws-import-v7" type="file"
          accept={mode === "single" ? ".xlsx,.xlsm,.docx,.pdf,.png,.jpg,.jpeg,.webp" : ".xlsx,.xlsm,.docx,.pdf"}
          style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
        {file ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {isImage ? <Image size={22} color="var(--accent-2)" /> : <FileText size={22} color="var(--accent)" />}
            <div style={{ fontWeight: 600, fontSize: 13, color: isImage ? "var(--accent-2)" : "var(--accent)" }}>{file.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>{(file.size / 1024).toFixed(0)} KB · clicca per cambiare</div>
            {isImage && <div className="badge badge-purple" style={{ fontSize: 10 }}>🤖 AI (Qwen)</div>}
          </div>
        ) : (
          <><Upload size={24} color={dragOver ? "var(--accent)" : "var(--text-3)"} />
          <div style={{ fontWeight: 500, fontSize: 13 }}>Trascina o clicca</div>
          <div className="muted" style={{ fontSize: 11 }}>{mode === "single" ? "Excel, Word, PDF, PNG, JPG" : "Excel, Word, PDF"}</div></>
        )}
      </div>

      <button className="btn btn-primary" onClick={submit} disabled={!file || loading || (mode === "single" && !targetUserId)}>
        {loading ? <span className="spinner spinner-sm" /> : mode === "stations" ? <MapPin size={14} /> : <Users size={14} />}
        {loading ? "Elaborazione…" : mode === "bulk" ? "Importa turni team" : mode === "single" ? "Importa per utente" : "Importa postazioni"}
      </button>

      {error && <div className="msg msg-error"><AlertCircle size={14} /><span style={{ fontSize: 12 }}>{error}</span></div>}
      {singleMsg && <div className="msg msg-success"><CheckCircle2 size={14} /><span style={{ fontSize: 12 }}>{singleMsg}</span></div>}

      {bulkResult && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="msg msg-success"><CheckCircle2 size={13} /><span>{bulkResult.month_label} — Import completato</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "rgba(110,231,183,.08)", border: "1px solid rgba(110,231,183,.2)" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--accent)", fontFamily: "var(--font-display)" }}>{bulkResult.processed.length}</div>
              <div className="muted" style={{ fontSize: 11 }}>Importati</div>
              <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                {bulkResult.processed.map(c => <span key={c} className="badge badge-green" style={{ fontSize: 9 }}>{c}</span>)}
              </div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.2)" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--warning)", fontFamily: "var(--font-display)" }}>{bulkResult.skipped.length}</div>
              <div className="muted" style={{ fontSize: 11 }}>Non trovati</div>
              <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                {bulkResult.skipped.map(c => <span key={c} className="badge badge-yellow" style={{ fontSize: 9 }}>{c}</span>)}
              </div>
            </div>
          </div>
          {bulkResult.errors.length > 0 && (
            <div style={{ padding: "8px 10px", borderRadius: "var(--radius-sm)", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)" }}>
              {bulkResult.errors.map(([code, msg], i) => <div key={i} style={{ fontSize: 11, color: "var(--danger)" }}>{code}: {msg}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
