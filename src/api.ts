export async function api<T = unknown>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const r = await fetch('/api' + caminho, {
    method: opcoes.metodo ?? (opcoes.corpo !== undefined ? 'POST' : 'GET'),
    headers: opcoes.corpo !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  });
  const texto = await r.text();
  let dados: unknown = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  if (!r.ok) {
    const msg = (dados as { erro?: string } | null)?.erro ?? `Erro ${r.status}`;
    throw new Error(msg);
  }
  return dados as T;
}

export const get = <T,>(c: string) => api<T>(c);
export const post = <T,>(c: string, corpo: unknown = {}) => api<T>(c, { metodo: 'POST', corpo });
export const put = <T,>(c: string, corpo: unknown) => api<T>(c, { metodo: 'PUT', corpo });
export const del = <T,>(c: string) => api<T>(c, { metodo: 'DELETE' });
