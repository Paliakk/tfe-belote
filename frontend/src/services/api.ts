// src/services/api.ts
import { getToken } from "@/services/auth";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export async function api<T = any>(
  path: string,
  init: RequestInit & { json?: any } = {}
): Promise<T> {
  const token = await getToken().catch(() => null);

  const headers: Record<string, string> = {
    "Accept": "application/json",
    ...(init.headers as any),
  };

  // S’il y a un body JSON “haut niveau”, on le sérialise
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (body && !(headers["Content-Type"])) {
    // si tu passes init.body toi-même, assure le content-type
    headers["Content-Type"] = "application/json";
  }

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...init, headers, body });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // remonte l’erreur (très important !)
    throw new Error(`[${res.status}] ${text || res.statusText}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  // JSON standard
  return res.json() as Promise<T>;
}
