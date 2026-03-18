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

export function bootAuthToken() {
  const token = localStorage.getItem("workshift_token");
  if (token) {
    setAuthToken(token);
  }
  return token;
}
