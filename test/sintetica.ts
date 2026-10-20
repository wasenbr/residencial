// Planilha fictícia no mesmo formato da real (nomes inventados), para os testes
// rodarem em qualquer lugar sem dados de alunos no repositório.
import type { Grade } from '../src/import/planilha';

function grade(linhas: number, colunas: number): Grade {
  return Array.from({ length: linhas }, () => Array.from({ length: colunas }, () => null));
}
function poe(g: Grade, r: number, c: number, ...valores: (string | number | null)[]) {
  valores.forEach((v, i) => { g[r][c + i] = v; });
}

export function planilhaSintetica(): Record<string, Grade> {
  // Funcional: dois blocos lado a lado (como "12:00" e "18:20").
  const f = grade(30, 20);
  poe(f, 0, 0, 'Kids');
  poe(f, 0, 9, 'FUNCIONAL 18:20 segunda/quarta/sexta');
  poe(f, 1, 0, 'Nº', 'FUNCIONAL', 'PAGAMENTO', 'DINHEIRO', 'gympass', 'DEB', 'CARTÃO CRED', 'RECEBER ');
  poe(f, 2, 0, 1, 'Aluna Um', 'pago', 200, null, null, null, 200);
  poe(f, 3, 0, 2, 'Aluno Dois', 'pago', null, 100, null, null, 100);
  poe(f, 4, 0, 3, 'Aluna Tres', 'pago 5/6', null, null, null, 120, 120);
  poe(f, 5, 0, 4, 'Aluno Quatro', 'pago', 80, null, null, null, 0);      // RECEBER 0 com dinheiro: aviso
  poe(f, 1, 9, 'Nº', 'FUNCIONAL', 'PAGAMENTO', 'DINHEIRO', 'GYMPASS', 'DEB', 'CARTÃO CRED', 'RECEBER ');
  poe(f, 2, 9, 1, 'Aluna Cinco', 'pago', 130, null, null, null, 130);
  poe(f, 3, 9, 2, 'Aluna Um', 'pago', 50, null, null, null, 50);         // mesma pessoa em outro bloco
  poe(f, 4, 9, 3, 'Aluno Seis (mae Aluna Um)', 'pago', 'pago', null, null, null, 90); // "pago" no lugar do valor
  poe(f, 14, 1, 'VALOR TOTAL', 'x');

  // Personal: coluna de total sem cabeçalho depois das formas.
  const p = grade(20, 10);
  poe(p, 0, 0, 'Personal');
  poe(p, 1, 0, 'Nº', 'FUNCIONAL', 'PAGAMENTO', 'DINHEIRO', 'SAFRA DEB', 'Gympass', 'SAFRA', ' CRED');
  poe(p, 2, 0, 1, 'Aluna Sete', 'pago', 200, null, null, null, null, 200);
  poe(p, 3, 0, 2, 'Aluno Oito', 'pago', 50, null, null, null, null, 240);   // pagou parte: falta 190
  poe(p, 4, 0, 3, 'Aluna Nove');                                              // sem valor
  poe(p, 5, 0, 4, 'Aluno Dez', 'pago', null, null, 40, null, null, 40);
  poe(p, 6, 0, 5, 'Aluno Onze');                                              // sem valor e sem preço

  // Ballet com nomes "criança + responsável".
  const b = grade(12, 10);
  poe(b, 0, 0, 'Ballet infantil');
  poe(b, 1, 0, 'Nº', 'FUNCIONAL', 'PAGAMENTO', 'DINHEIRO', 'CARTÃO DEB', 'gympass', 'CARTÃO CRED', 'RECEBER ');
  poe(b, 2, 0, 1, 'Livia 7 anos Silvana', null, null, null, null, null, null, 0);
  poe(b, 3, 0, 2, 'Giovana 8 anos Anelise', 'pago', 80, null, null, null, null, 80);

  // Aba de preços: usada quando o aluno está sem pagamento e sem valor.
  const al = grade(10, 5);
  poe(al, 0, 0, 1, 'Livia 7 anos Silvana', 'Ballet', 80);
  poe(al, 1, 0, 2, 'Aluna Nove', 'Personal', 150);

  // Totais, contas e pessoal.
  const t = grade(30, 14);
  poe(t, 0, 0, 'TOTAIS');
  poe(t, 1, 0, 'TOTAL GERAL', 'Recebido', 'nº', 'Faltou');
  poe(t, 2, 0, 'Aluguel', 0, 0);
  poe(t, 3, 0, 'BALLET JAZZ', 160, 80, 2, 80);
  poe(t, 4, 0, 'PERSONAL', 490, 290, 4, 190);
  poe(t, 5, 0, 'FUNCIONAL', 670, 670, 6, 0);
  poe(t, 12, 0, 'TOTAL GERAL', 1320);
  poe(t, 22, 0, 'CREDITO MÊS ant', 500);
  poe(t, 23, 0, 'GYMPASS MÊS ant', 300);
  poe(t, 2, 10, 'Aluguel DIA 09', 1000);
  poe(t, 3, 10, 'Luz DIA 29', 0);
  poe(t, 4, 10, 'INSS 18', 150);
  poe(t, 6, 10, 'Contador 20', 400);
  poe(t, 8, 10, null, 1550);   // subtotal sem descrição: separa contas e pessoal
  poe(t, 16, 10, 'Edison', 240);
  poe(t, 18, 10, 'Misael', 1800);
  poe(t, 22, 10, 'TOTAL', 3590);

  return { Funcional: f, Personal: p, 'Ballet': b, Alunos: al, Fechamento: t };
}
