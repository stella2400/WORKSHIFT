import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ShiftDefinition } from "../types";

export function SettingsPanel() {
  const [items, setItems] = useState<ShiftDefinition[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const { data } = await api.get<ShiftDefinition[]>("/settings/shifts");
    setItems(data);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    try {
      await api.put("/settings/shifts", items.map(({ id, is_active, ...rest }) => rest));
      setMessage("Impostazioni salvate");
      load();
    } catch {
      setMessage("Salvataggio non riuscito");
    }
  }

  return (
    <div className="card" style={{padding:24}}>
      <h2>Settings turni</h2>
      <div style={{color:'#94a3b8',marginBottom:16}}>Qui descrivi come sono divisi i turni nel tuo ambiente di lavoro. Non è legato solo all’ospedale.</div>
      <div style={{display:'grid',gap:12}}>
        {items.map((item, index) => (
          <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr 1fr',gap:10}}>
            <input className="input" value={item.code} onChange={(e)=>{
              const next=[...items]; next[index]={...next[index],code:e.target.value.toUpperCase()}; setItems(next)
            }} />
            <input className="input" value={item.label} onChange={(e)=>{
              const next=[...items]; next[index]={...next[index],label:e.target.value}; setItems(next)
            }} />
            <input className="input" value={item.color} onChange={(e)=>{
              const next=[...items]; next[index]={...next[index],color:e.target.value}; setItems(next)
            }} />
            <select className="input" value={item.category} onChange={(e)=>{
              const next=[...items]; next[index]={...next[index],category:e.target.value}; setItems(next)
            }}>
              <option value="work">Lavoro</option>
              <option value="off">Riposo</option>
              <option value="transition">Transizione</option>
            </select>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:10,marginTop:16}}>
        <button className="button secondary" onClick={()=>setItems([...items,{id:Date.now(),code:'',label:'',color:'#94a3b8',category:'work',sort_order:items.length+1,is_active:true}])}>Aggiungi turno</button>
        <button className="button" onClick={save}>Salva settings</button>
      </div>
      {message && <div style={{marginTop:10,color:'#cbd5e1'}}>{message}</div>}
    </div>
  )
}
