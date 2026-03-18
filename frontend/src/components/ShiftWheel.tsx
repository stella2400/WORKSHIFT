import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DashboardResponse } from "../types";

type Props = { dashboard: DashboardResponse };

export function ShiftWheel({ dashboard }: Props) {
  const [active, setActive] = useState(0);
  const shifts = dashboard.shifts;
  const defs = dashboard.definitions;
  const colorByCode = Object.fromEntries(defs.map((d) => [d.code, d.color]));

  const items = useMemo(() => shifts.slice(0, 31), [shifts]);
  const radius = 320;

  return (
    <div className="card" style={{padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h2 style={{margin:0}}>Ruota giornaliera</h2>
          <div style={{color:'#94a3b8'}}>Ogni faccia mostra un giorno. Ruota per scorrere il mese senza allungare la pagina.</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="button secondary" onClick={() => setActive((prev) => Math.max(prev - 1, 0))}>◀</button>
          <button className="button secondary" onClick={() => setActive((prev) => Math.min(prev + 1, items.length - 1))}>▶</button>
        </div>
      </div>
      <div className="carousel">
        <motion.div className="wheel" animate={{ rotateY: -active * (360 / Math.max(items.length, 1)) }} transition={{ type: "spring", stiffness: 70, damping: 16 }}>
          {items.map((item, index) => {
            const angle = (360 / items.length) * index;
            return (
              <div
                key={item.id}
                className="day-card"
                style={{ transform: `rotateY(${angle}deg) translateZ(${radius}px)` }}
              >
                <div>
                  <div style={{color:'#93c5fd',fontWeight:700}}>Giorno {new Date(item.shift_date).getDate()}</div>
                  <h3 style={{margin:'10px 0 4px'}}>{item.shift_label}</h3>
                  <div style={{color:'#94a3b8'}}>{new Date(item.shift_date).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})}</div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span className="badge" style={{background:`${colorByCode[item.shift_code] || '#334155'}22`, color: colorByCode[item.shift_code] || '#fff', border:`1px solid ${colorByCode[item.shift_code] || '#334155'}`}}>{item.shift_code}</span>
                  <span style={{color:item.manually_edited ? '#fbbf24' : '#94a3b8'}}>{item.manually_edited ? 'Modificato' : 'Importato'}</span>
                </div>
                <div style={{fontSize:14,color:'#cbd5e1'}}>{item.notes || 'Nessuna nota'}</div>
              </div>
            )
          })}
        </motion.div>
      </div>
    </div>
  );
}
