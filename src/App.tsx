import { Navigate, Route, Routes } from 'react-router-dom';
import { Abas, Carregando, Menu } from './ui';
import { Provedor, useApp } from './store';
import { Dashboard, Painel } from './pages/Dashboard';
import { Historico } from './pages/Historico';
import { Alunos } from './pages/Alunos';
import { AlunoFicha } from './pages/AlunoFicha';
import { Turmas } from './pages/Turmas';
import { Mensalidades } from './pages/Mensalidades';
import { Receber } from './pages/Receber';
import { NovoAluno } from './pages/NovoAluno';
import { DespesaNova, Despesas } from './pages/Despesas';
import { Gympass } from './pages/Gympass';
import { Fechamento } from './pages/Fechamento';
import { Configuracoes } from './pages/Configuracoes';
import { Importar } from './pages/Importar';

function Casca() {
  const { base, erro } = useApp();
  if (!base) {
    return (
      <div style={{ padding: 32 }}>
        <Carregando erro={erro ? `Não consegui carregar os dados: ${erro}` : null} />
      </div>
    );
  }
  return (
    <div className="app">
      <Menu />
      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Painel />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/alunos" element={<Alunos />} />
          <Route path="/alunos/:id" element={<AlunoFicha />} />
          <Route path="/turmas" element={<Turmas />} />
          <Route path="/mensalidades" element={<Mensalidades />} />
          <Route path="/receber" element={<Receber />} />
          <Route path="/novo-aluno" element={<NovoAluno />} />
          <Route path="/gympass" element={<Gympass />} />
          <Route path="/despesas" element={<Despesas />} />
          <Route path="/despesas/nova" element={<DespesaNova />} />
          <Route path="/fechamento" element={<Fechamento />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/importar" element={<Importar />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Abas />
    </div>
  );
}

export default function App() {
  return <Provedor><Casca /></Provedor>;
}
