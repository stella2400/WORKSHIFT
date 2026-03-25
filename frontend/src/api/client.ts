import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
export const api = axios.create({ baseURL });

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem("workshift_token", token);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem("workshift_token");
  }
}

export function bootAuthToken(): string | null {
  const token = localStorage.getItem("workshift_token");
  if (token) setAuthToken(token);
  return token;
}

export function apiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: string | { msg: string }[] } }; message?: string };
  const detail = e?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map(d => d.msg).join(", ");
  return (detail as string) || e?.message || "Errore sconosciuto";
}

export const PASSWORD_HINT = "Min. 8 caratteri, 1 maiuscola, 1 numero, 1 carattere speciale (!@#$...)";

export function validatePasswordClient(pwd: string): string {
  if (pwd.length < 8) return "Minimo 8 caratteri";
  if (!/[A-Z]/.test(pwd)) return "Almeno una maiuscola";
  if (!/\d/.test(pwd)) return "Almeno un numero";
  if (!/[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/.test(pwd)) return "Almeno un carattere speciale";
  return "";
}
