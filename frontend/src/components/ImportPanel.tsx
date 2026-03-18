import { useState } from "react";
import { api } from "../api/client";

export function ImportPanel({ onDone }: { onDone: () => void }) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function submit() {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/imports/me", form, { headers: { "Content-Type": "multipart/form-data" } });
      setMessage(`Import completato: ${data.month_label}. ${data.source_note || ""}`);
      onDone();
    } catch (err: any) {
      setMessage(err?.response?.data?.detail || "Import non riuscito");
    }
  }

  return (
    <div className="card" style={{padding:24, display:'grid', gap:14}}>
      <h2 style={{margin:0}}>Importa turni</h2>
      <div style={{color:'#94a3b8'}}>Supporta immagini, PDF, Word ed Excel. Per una versione vendibile, il parsing immagini va collegato a un OCR specializzato: in questa build la parte più robusta è su PDF/Word/Excel.</div>
      <input className="input" type="file" accept=".xlsx,.xlsm,.docx,.pdf,.png,.jpg,.jpeg,.webp" onChange={(e)=>setFile(e.target.files?.[0] || null)} />
      <button className="button" onClick={submit}>Importa file</button>
      {message && <div style={{color:'#cbd5e1'}}>{message}</div>}
    </div>
  )
}
