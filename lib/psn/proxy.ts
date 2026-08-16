import "server-only";
import { ProxyAgent, setGlobalDispatcher } from "undici";

let configured = false;

/**
 * Sony bloquea el intercambio de NPSSO (y probablemente otras llamadas a la
 * PSN API) desde IPs de datacenter, incluidas las de las funciones
 * serverless de Vercel. Si `PSN_PROXY_URL` está configurada (proxy con IP
 * residencial/no-datacenter), reruteamos todo el tráfico saliente de esta
 * función a través de ese proxy. Sin esa env var, las llamadas salen
 * directo (esto es lo esperado en desarrollo local, donde no hace falta).
 */
export function ensurePsnOutboundProxy(): void {
  if (configured) return;
  configured = true;

  const proxyUrl = process.env.PSN_PROXY_URL;
  if (!proxyUrl) return;

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}
