import { useEffect, useState } from "react";
import { Settings2, Check } from "lucide-react";
import { api } from "../api/client";
import { DashboardResponse, User, buildShiftMap } from "../types";

type CardOption = { label: string; shortLabel: string; code: string };
type Props = { dashboard: DashboardResponse; currentUser: User; onUserUpdate: (u: User) => void };

function getSummaryValue(dashboard: DashboardResponse, code: string): string {
  const s = dashboard.summary;
  switch (code) {
    case "total_days":    return String(s.total_days);
    case "work_days":     return String(s.work_days);
    case "off_days":      return String(s.off_days);
    case "uploads_count": return String(s.uploads_count);
    case "hours_worked":  return `${s.hours_worked}h`;
    case "overtime_hours":return `${s.overtime_hours}h`;
    default:
      return s.by_code[code] !== undefined ? String(s.by_code[code]) : "—";
  }
}

const BASE_OPTIONS: CardOption[] = [
  { label: "Giorni tot.",  shortLabel: "Giorni tot.",  code: "total_days" },
  { label: "Giorni lav.", shortLabel: "Giorni lav.", code: "work_days" },
  { label: "Riposi",      shortLabel: "Riposi",      code: "off_days" },
  { label: "Ore lav.",    shortLabel: "Ore lav.",    code: "hours_worked" },
  { label: "Straord.",    shortLabel: "Straord.",    code: "overtime_hours" },
  { label: "Import",      shortLabel: "Import",      code: "uploads_count" },
];

const DEFAULT_CODES = ["total_days", "work_days", "off_days", "hours_worked"];

export function DashboardCards({ dashboard, currentUser, onUserUpdate }: Props) {
  const shiftDefs = buildShiftMap(dashboard.definitions);

  // All available options = base + one per configured shift code
  const allOptions: CardOption[] = [
    ...BASE_OPTIONS,
    ...dashboard.definitions.map(d => ({
      label: `${d.label} (${d.code})`,
      shortLabel: d.label,
      code: d.code,
    })),
  ];

  const [selectedCodes, setSelectedCodes] = useState<string[]>(DEFAULT_CODES);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentUser.dashboard_config) {
      try {
        const parsed = JSON.parse(currentUser.dashboard_config);
        // Support both old format [{label, code}] and new format [string]
        if (Array.isArray(parsed) && parsed.length > 0) {
          const codes = typeof parsed[0] === "string"
            ? parsed
            : parsed.map((c: { code?: string }) => c.code).filter(Boolean);
          if (codes.length > 0) setSelectedCodes(codes);
        }
      } catch { /**/ }
    }
  }, [currentUser.dashboard_config]);

  function cardColor(code: string): string | undefined {
    return shiftDefs[code]?.color;
  }

  function cardLabel(code: string): string {
    const base = BASE_OPTIONS.find(o => o.code === code);
    if (base) return base.shortLabel;
    return shiftDefs[code]?.label || code;
  }

  async function save() {
    setSaving(true);
    try {
      // Save as simple array of codes (new format)
      await api.put("/users/me/dashboard-config", { cards: draft.map(code => ({ code, label: cardLabel(code) })) });
      onUserUpdate({ ...currentUser, dashboard_config: JSON.stringify(draft) });
      setSelectedCodes(draft);
      setEditing(false);
    } catch { /**/ } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="stats">
        {selectedCodes.map(code => {
          const color = cardColor(code);
          const value = getSummaryValue(dashboard, code);
          return (
            <div key={code} className="card" style={{
              padding: "20px 22px",
              borderLeft: color ? `4px solid ${color}` : undefined,
            }}>
              <div style={{
                fontSize: 40, fontWeight: 800, lineHeight: 1,
                fontFamily: "'DM Sans', sans-serif",  // DM Sans has clear 0 vs O
                color: color || "var(--text)",
                letterSpacing: "-.02em",
              }}>
                {value}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6, fontWeight: 500 }}>
                {cardLabel(code)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Config button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        {!editing ? (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, opacity: 0.6 }}
            onClick={() => { setDraft([...selectedCodes]); setEditing(true); }}>
            <Settings2 size={13}/> Configura card
          </button>
        ) : (
          <div className="card card-pad fade-in" style={{ width: "100%" }}>
            <div className="heading" style={{ fontSize: 15, marginBottom: 6 }}>
              Configura le {Math.min(draft.length, 4)} card della dashboard
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Seleziona fino a 4 dati da visualizzare.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {allOptions.map(opt => {
                const isSelected = draft.includes(opt.code);
                const color = cardColor(opt.code);
                return (
                  <button key={opt.code}
                    onClick={() => {
                      if (isSelected) {
                        setDraft(d => d.filter(c => c !== opt.code));
                      } else if (draft.length < 4) {
                        setDraft(d => [...d, opt.code]);
                      }
                    }}
                    style={{
                      padding: "7px 14px", borderRadius: 99, border: "none", cursor: "pointer",
                      fontSize: 13, fontWeight: 600, transition: "all .15s",
                      background: isSelected ? (color || "var(--accent)") : "rgba(255,255,255,.08)",
                      color: isSelected ? (color ? "#000" : "var(--bg-1)") : "var(--text-2)",
                      display: "flex", alignItems: "center", gap: 6,
                      opacity: (!isSelected && draft.length >= 4) ? 0.4 : 1,
                    }}>
                    {isSelected && <Check size={12}/>}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || draft.length === 0}>
                {saving ? <span className="spinner spinner-sm"/> : <Check size={13}/>} Salva
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>× Annulla</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
