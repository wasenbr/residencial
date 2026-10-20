import { readFileSync, readdirSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';

// D1 local (em memória) para os testes, com as migrações aplicadas.
export async function bancoDeTeste() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
  const db = proxy.env.DB;
  for (const f of readdirSync('migrations').sort()) {
    const sql = readFileSync(`migrations/${f}`, 'utf8');
    const comandos = sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
    for (const c of comandos) await db.prepare(c).run();
  }
  return { db, fechar: () => proxy.dispose() };
}
