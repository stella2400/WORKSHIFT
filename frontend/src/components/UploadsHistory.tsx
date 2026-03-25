import { FileText, FileSpreadsheet, File, Image } from "lucide-react";
import { Upload } from "../types";

function FileIcon({ type }: { type: string }) {
  if (type === "xlsx" || type === "xlsm") return <FileSpreadsheet size={14} color="var(--accent)" />;
  if (type === "docx") return <FileText size={14} color="var(--accent-2)" />;
  if (type === "pdf") return <File size={14} color="var(--accent-3)" />;
  if (["png","jpg","jpeg","webp"].includes(type)) return <Image size={14} color="#60a5fa" />;
  return <File size={14} color="var(--text-3)" />;
}

export function UploadsHistory({ uploads }: { uploads: Upload[] }) {
  if (!uploads.length) return null;
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div><div className="label">Storico</div><h2 className="heading" style={{ fontSize: 16, marginTop: 4 }}>Import recenti</h2></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {uploads.slice(0, 6).map(u => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,.03)", border: "1px solid var(--border)" }}>
            <FileIcon type={u.file_type} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.original_filename}</div>
              <div className="muted" style={{ fontSize: 10 }}>{u.month_label} · {new Date(u.created_at).toLocaleDateString("it-IT")}</div>
            </div>
            <span className={`badge ${u.processing_status === "processed" ? "badge-green" : "badge-yellow"}`} style={{ fontSize: 10 }}>
              {u.processing_status === "processed" ? "✓" : "…"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
