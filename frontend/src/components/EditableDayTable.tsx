import { useState } from "react";
import { api } from "../api/client";
import { DashboardResponse } from "../types";

export function EditableDayTable({ dashboard, onRefresh }: { dashboard: DashboardResponse; onRefresh: () => void }) {
  const [message, setMessage] = useState("");

  async function updateShift(id: number, shift_code: string, shift_label: string) {
    try {
      await api.patch(`/shifts/${id}`, { shift_code, shift_label });
      setMessage("Turno aggiornato");
      onRefresh();
    } catch {
      setMessage("Aggiornamento non riuscito");
    }
  }

  return (
    <div className="card" style={{padding:24}}>
      <h2 style={{marginTop:0}}>Correzioni rapide</h2>
      <div style={{display:'grid',gap:10,maxHeight:420,overflow:'auto'}}>
        {dashboard.shifts.map((item) => (
          <div key={item.id} style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr auto',gap:10,alignItems:'center'}}>
            <div>{new Date(item.shift_date).toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit'})}</div>
            <input className="input" value={item.shift_code} onChange={(e)=>updateShift(item.id, e.target.value.toUpperCase(), item.shift_label)} />
            <input className="input" value={item.shift_label} onChange={(e)=>updateShift(item.id, item.shift_code, e.target.value)} />
            <span style={{color:item.manually_edited ? '#fbbf24' : '#94a3b8'}}>{item.manually_edited ? 'Manuale' : 'Auto'}</span>
          </div>
        ))}
      </div>
      {message && <div style={{marginTop:12,color:'#cbd5e1'}}>{message}</div>}
    </div>
  )
}
