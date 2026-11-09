#!/usr/bin/env node
/**
 * Teste de integração contra o Supabase de verdade.
 *
 * Os testes de `npm test` rodam contra fábricas que imitam o banco. Este aqui
 * exercita o banco real: cria usuários, monta um espaço, registra compras e
 * confere se os triggers, as colunas geradas e o Row Level Security se
 * comportam como a aplicação espera.
 *
 * O que ele prova, em ordem:
 *   1. Criar um espaço cadastra as 208 linhas do enxoval
 *   2. Compra parcial atualiza quantidade comprada e pendente
 *   3. Compras sucessivas consolidam total e preço médio (o caso dos 6 pratos)
 *   4. Compra parcelada separa o que foi pago do que está comprometido
 *   5. Excluir uma compra devolve o item ao estado anterior
 *   6. "Não será comprado" tira das pendências sem apagar o histórico
 *   7. O código de pareamento liga o segundo aparelho ao mesmo espaço
 *   8. O orçamento e o saldo batem
 *   9. UM CASAL NÃO ENXERGA OS DADOS DO OUTRO
 *  10. O cliente não consegue adulterar os agregados financeiros
 *
 * Tudo que ele cria é apagado no fim, inclusive se um teste falhar.
 *
 * Uso:
 *   export SUPABASE_ACCESS_TOKEN=sbp_...
 *   node scripts/integration-test.mjs --projeto <ref>
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.supabase.com';

const argv = process.argv.slice(2);
const valorDe = (nome, padrao = null) => {
  const i = argv.indexOf(`--${nome}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : padrao;
};

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('Faltou SUPABASE_ACCESS_TOKEN.');
  process.exit(1);
}

/* ─────────────────────────── Saída ──────────────────────────────────────── */

const cor = {
  reset: '[0m',
  dim: '[2m',
  bold: '[1m',
  verde: '[32m',
  amarelo: '[33m',
  vermelho: '[31m',
};

const log = (m = '') => console.log(m);
const titulo = (m) => log(`\n${cor.bold}▸ ${m}${cor.reset}`);
const nota = (m) => log(`    ${cor.dim}${m}${cor.reset}`);

let passaram = 0;
let falharam = 0;

function conferir(condicao, descricao, detalhe) {
  if (condicao) {
    passaram += 1;
    log(`  ${cor.verde}✓${cor.reset} ${descricao}`);
  } else {
    falharam += 1;
    log(`  ${cor.vermelho}✗${cor.reset} ${descricao}`);
    if (detalhe !== undefined) nota(String(detalhe));
  }
}

const perto = (a, b, tolerancia = 0.005) => Math.abs(Number(a) - Number(b)) < tolerancia;
const brl = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

/* ───────────────────── Acesso ao projeto ────────────────────────────────── */

const ref = valorDe('projeto') ?? lerRefDoEnv();

function lerRefDoEnv() {
  const caminho = join(root, '.env');
  if (!existsSync(caminho)) return null;
  const m = /VITE_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/.exec(
    readFileSync(caminho, 'utf8'),
  );
  return m?.[1] ?? null;
}

if (!ref) {
  console.error('Informe --projeto <ref> ou tenha um .env com VITE_SUPABASE_URL.');
  process.exit(1);
}

const base = `https://${ref}.supabase.co`;

async function gerencia(caminho, opcoes = {}) {
  const r = await fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opcoes.headers },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${caminho}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

/** SQL com privilégio total — usado só para preparar e limpar o cenário. */
const sql = (query) =>
  gerencia(`/v1/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

/* ───────────────────── Cliente da API, como o app usa ───────────────────── */

let anonKey;
let serviceKey;

/** Chamada à API REST/RPC com o token de uma pessoa — o RLS vale aqui. */
async function comoUsuario(sessao, caminho, opcoes = {}) {
  const r = await fetch(`${base}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${sessao.access_token}`,
      'Content-Type': 'application/json',
      Prefer: opcoes.prefer ?? 'return=representation',
      ...opcoes.headers,
    },
  });
  const t = await r.text();
  const corpo = t ? JSON.parse(t) : null;
  if (!r.ok) {
    const erro = new Error(corpo?.message ?? t.slice(0, 200));
    erro.status = r.status;
    erro.corpo = corpo;
    throw erro;
  }
  return corpo;
}

const rpc = (sessao, nome, args) =>
  comoUsuario(sessao, `/rest/v1/rpc/${nome}`, { method: 'POST', body: JSON.stringify(args) });

/* ───────────────────── Usuários de teste ────────────────────────────────── */

const marca = `teste-${randomBytes(4).toString('hex')}`;
const criados = [];

/**
 * Abre uma sessão anônima, exatamente como o aplicativo faz no primeiro uso
 * de um aparelho: nenhum e-mail, nenhuma senha, nenhum cadastro.
 */
async function criarAparelho(apelido) {
  const r = await fetch(`${base}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { display_name: `${marca}-${apelido}` } }),
  });

  const corpo = await r.json();
  if (!r.ok || !corpo.access_token) {
    throw new Error(
      `Não abriu a sessão anônima de ${apelido}: ${JSON.stringify(corpo).slice(0, 200)}`,
    );
  }

  criados.push(corpo.user.id);
  return { id: corpo.user.id, apelido, access_token: corpo.access_token };
}

/* ───────────────────────────── Limpeza ──────────────────────────────────── */

async function limpar() {
  titulo('Limpando o que o teste criou');

  try {
    // Os espaços saem primeiro: tudo o mais cai em cascata a partir deles.
    const espacos = await sql(
      `delete from public.spaces where name like 'TESTE ${marca}%' returning id`,
    );
    nota(`${espacos.length} espaço(s) removido(s)`);
  } catch (e) {
    log(`  ${cor.amarelo}!${cor.reset} Falha ao remover espaços: ${e.message}`);
  }

  let removidos = 0;
  for (const id of criados) {
    try {
      const r = await fetch(`${base}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (r.ok) removidos += 1;
    } catch {
      /* segue tentando os outros */
    }
  }
  nota(`${removidos}/${criados.length} usuário(s) removido(s)`);

  // Confere que não sobrou nada com a marca do teste.
  const [sobra] = await sql(`
    select
      (select count(*) from public.spaces where name like 'TESTE ${marca}%')::int as espacos,
      (select count(*) from auth.users
        where raw_user_meta_data ->> 'display_name' like '${marca}-%')::int as usuarios,
      (select count(*) from public.items i
         join public.spaces s on s.id = i.space_id
        where s.name like 'TESTE ${marca}%')::int as itens
  `);

  const limpo = sobra.espacos === 0 && sobra.usuarios === 0 && sobra.itens === 0;
  conferir(
    limpo,
    'Nenhum resíduo do teste ficou no banco',
    `espaços=${sobra.espacos} usuários=${sobra.usuarios} itens=${sobra.itens}`,
  );
}

/* ─────────────────────────────── Testes ─────────────────────────────────── */

async function executar() {
  log(`${cor.bold}Nosso Lar — teste de integração${cor.reset}`);
  nota(`projeto ${ref} · marca ${marca}`);

  // ── Chaves
  const chaves = await gerencia(`/v1/projects/${ref}/api-keys?reveal=true`);
  anonKey = chaves.find((k) => k.name === 'anon')?.api_key;
  serviceKey = chaves.find((k) => k.name === 'service_role')?.api_key;
  if (!anonKey || !serviceKey) throw new Error('Não consegui ler as chaves do projeto.');

  // ── Pessoas
  titulo('Preparando os aparelhos (sem cadastro, sem senha)');
  const ana = await criarAparelho('ana');
  const bruno = await criarAparelho('bruno');
  const intruso = await criarAparelho('intruso');
  conferir(true, '3 sessões anônimas abertas, como o app faz no primeiro uso');

  const perfil = await comoUsuario(ana, `/rest/v1/profiles?id=eq.${ana.id}&select=display_name,email`);
  conferir(
    perfil.length === 1 && perfil[0].display_name === `${marca}-ana`,
    'O gatilho criou o perfil sozinho, a partir da sessão anônima',
    JSON.stringify(perfil),
  );
  conferir(perfil[0].email === null, 'O perfil não tem e-mail — não existe cadastro');

  /* ── 1 · Criar espaço cadastra a lista inicial ───────────────────────── */

  titulo('1 · Criar o espaço cadastra as 208 linhas do enxoval');

  const espacoAna = await rpc(ana, 'create_space', { p_name: `TESTE ${marca} casal A` });
  const espacoIntruso = await rpc(intruso, 'create_space', { p_name: `TESTE ${marca} casal B` });

  const contagem = await comoUsuario(
    ana,
    `/rest/v1/items?space_id=eq.${espacoAna}&select=id`,
    { prefer: 'count=exact', headers: { Range: '0-0' } },
  ).catch(() => null);

  const todosItens = await comoUsuario(
    ana,
    `/rest/v1/items?space_id=eq.${espacoAna}&select=id,name,is_task,status,unit_price_estimate,qty_bought`,
  );

  conferir(todosItens.length === 208, `208 itens cadastrados (achei ${todosItens.length})`);
  conferir(
    todosItens.filter((i) => i.is_task).length === 6,
    '6 tarefas de verificação, separadas dos produtos',
  );
  conferir(
    todosItens.every((i) => Number(i.unit_price_estimate) === 0),
    'Nenhum preço inventado: todos começam em R$ 0,00',
  );
  conferir(
    todosItens.every((i) => Number(i.qty_bought) === 0 && i.status === 'pendente'),
    'Nenhuma compra fictícia: tudo começa pendente',
  );

  const categorias = await comoUsuario(ana, `/rest/v1/categories?space_id=eq.${espacoAna}&select=code`);
  conferir(categorias.length === 14, `14 categorias (achei ${categorias.length})`);
  void contagem;

  /* ── 2 e 3 · O caso dos 6 pratos ──────────────────────────────────────── */

  titulo('2 e 3 · Compra parcial e compras sucessivas (o caso dos 6 pratos)');

  const [pratos] = await comoUsuario(
    ana,
    `/rest/v1/items?space_id=eq.${espacoAna}&name=eq.Pratos%20rasos&select=*`,
  );
  conferir(Number(pratos.qty_needed) === 6, `"Pratos rasos" precisa de 6 unidades`);

  // Preço estimado de R$ 25,00 para dar base à economia.
  await comoUsuario(ana, `/rest/v1/items?id=eq.${pratos.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ unit_price_estimate: 25 }),
  });

  // Primeira compra: 4 pratos por R$ 80,00.
  await comoUsuario(ana, '/rest/v1/purchases', {
    method: 'POST',
    body: JSON.stringify({
      space_id: espacoAna,
      item_id: pratos.id,
      description: 'Pratos rasos',
      qty: 4,
      unit_price: 20,
      total_paid: 80,
      purchased_at: '2026-03-10',
      payment_method: 'pix',
    }),
  });

  let [parcial] = await comoUsuario(ana, `/rest/v1/items?id=eq.${pratos.id}&select=*`);
  conferir(Number(parcial.qty_bought) === 4, `Quantidade comprada = 4 (${parcial.qty_bought})`);
  conferir(Number(parcial.qty_pending) === 2, `Quantidade pendente = 2 (${parcial.qty_pending})`);
  conferir(parcial.status === 'parcial', `Status = parcial (${parcial.status})`);
  conferir(
    perto(parcial.estimated_remaining, 50),
    `Falta estimado = ${brl(50)} (${brl(parcial.estimated_remaining)})`,
  );

  // Segunda compra: os 2 restantes por R$ 45,00.
  await comoUsuario(ana, '/rest/v1/purchases', {
    method: 'POST',
    body: JSON.stringify({
      space_id: espacoAna,
      item_id: pratos.id,
      description: 'Pratos rasos',
      qty: 2,
      unit_price: 22.5,
      total_paid: 45,
      purchased_at: '2026-03-20',
      payment_method: 'pix',
    }),
  });

  let [completo] = await comoUsuario(ana, `/rest/v1/items?id=eq.${pratos.id}&select=*`);
  conferir(Number(completo.qty_bought) === 6, `Quantidade comprada = 6 (${completo.qty_bought})`);
  conferir(Number(completo.qty_pending) === 0, `Quantidade pendente = 0 (${completo.qty_pending})`);
  conferir(perto(completo.total_spent, 125), `Total gasto = ${brl(125)} (${brl(completo.total_spent)})`);
  conferir(
    perto(completo.avg_unit_paid, 20.8333, 0.0005),
    `Preço médio = ${brl(20.8333)} (${brl(completo.avg_unit_paid)})`,
  );
  conferir(completo.status === 'comprado', `Status = comprado (${completo.status})`);
  conferir(
    perto(completo.savings, 25),
    `Economia = ${brl(25)} — 6 × ${brl(25)} estimados − ${brl(125)} pagos (${brl(completo.savings)})`,
  );
  conferir(completo.last_purchase_at === '2026-03-20', `Última compra = 20/03/2026`);

  /* ── 4 · Compra parcelada ─────────────────────────────────────────────── */

  titulo('4 · Compra parcelada separa o pago do comprometido');

  const [geladeira] = await comoUsuario(
    ana,
    `/rest/v1/items?space_id=eq.${espacoAna}&name=eq.Geladeira&select=*`,
  );

  const [compraParcelada] = await comoUsuario(ana, '/rest/v1/purchases', {
    method: 'POST',
    body: JSON.stringify({
      space_id: espacoAna,
      item_id: geladeira.id,
      description: 'Geladeira',
      qty: 1,
      unit_price: 3600,
      total_paid: 3600,
      purchased_at: '2026-03-05',
      first_due_date: '2026-04-05',
      payment_method: 'credito',
      installments: 10,
      installments_paid: 3,
    }),
  });

  const parcelas = await comoUsuario(
    ana,
    `/rest/v1/installments?purchase_id=eq.${compraParcelada.id}&select=*&order=number`,
  );

  conferir(parcelas.length === 10, `10 parcelas geradas pelo banco (${parcelas.length})`);
  conferir(
    perto(parcelas.reduce((s, p) => s + Number(p.amount), 0), 3600),
    'A soma das parcelas fecha exatamente no total',
  );
  conferir(
    parcelas.filter((p) => p.paid).length === 3,
    `3 parcelas marcadas como pagas (${parcelas.filter((p) => p.paid).length})`,
  );
  conferir(parcelas[0].due_date === '2026-04-05', `1º vencimento = 05/04/2026 (${parcelas[0].due_date})`);
  conferir(parcelas[9].due_date === '2027-01-05', `10º vencimento = 05/01/2027 (${parcelas[9].due_date})`);

  const pagamentos = await comoUsuario(
    ana,
    `/rest/v1/payments?purchase_id=eq.${compraParcelada.id}&select=amount`,
  );
  const desembolsado = pagamentos.reduce((s, p) => s + Number(p.amount), 0);
  conferir(
    pagamentos.length === 3 && perto(desembolsado, 1080),
    `Livro-caixa com 3 lançamentos somando ${brl(1080)} (${brl(desembolsado)})`,
  );

  const emAberto = parcelas.filter((p) => !p.paid).reduce((s, p) => s + Number(p.amount), 0);
  conferir(perto(emAberto, 2520), `Comprometido = ${brl(2520)} (${brl(emAberto)})`);

  const [geladeiraDepois] = await comoUsuario(ana, `/rest/v1/items?id=eq.${geladeira.id}&select=*`);
  conferir(
    perto(geladeiraDepois.total_spent, 3600) && perto(geladeiraDepois.paid_amount, 1080),
    `No item: contratado ${brl(3600)}, desembolsado ${brl(1080)}`,
    `contratado=${geladeiraDepois.total_spent} desembolsado=${geladeiraDepois.paid_amount}`,
  );

  /* ── 5 · Excluir compra desfaz tudo ───────────────────────────────────── */

  titulo('5 · Excluir uma compra devolve o item ao estado anterior');

  const comprasPratos = await comoUsuario(
    ana,
    `/rest/v1/purchases?item_id=eq.${pratos.id}&select=id&order=purchased_at.desc`,
  );
  await comoUsuario(ana, `/rest/v1/purchases?id=eq.${comprasPratos[0].id}`, { method: 'DELETE' });

  const [depoisExcluir] = await comoUsuario(ana, `/rest/v1/items?id=eq.${pratos.id}&select=*`);
  conferir(Number(depoisExcluir.qty_bought) === 4, `Voltou para 4 compradas (${depoisExcluir.qty_bought})`);
  conferir(Number(depoisExcluir.qty_pending) === 2, `Voltou para 2 pendentes (${depoisExcluir.qty_pending})`);
  conferir(perto(depoisExcluir.total_spent, 80), `Total voltou a ${brl(80)} (${brl(depoisExcluir.total_spent)})`);
  conferir(depoisExcluir.status === 'parcial', `Status voltou a parcial (${depoisExcluir.status})`);

  const parcelasOrfas = await comoUsuario(
    ana,
    `/rest/v1/installments?purchase_id=eq.${comprasPratos[0].id}&select=id`,
  );
  conferir(parcelasOrfas.length === 0, 'As parcelas da compra excluída sumiram junto');

  /* ── 6 · "Não será comprado" ──────────────────────────────────────────── */

  titulo('6 · "Não será comprado" tira das pendências sem apagar o histórico');

  await comoUsuario(ana, `/rest/v1/items?id=eq.${pratos.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ excluded: true }),
  });

  const [excluido] = await comoUsuario(ana, `/rest/v1/items?id=eq.${pratos.id}&select=*`);
  conferir(excluido.status === 'nao_sera_comprado', `Status = não será comprado`);
  conferir(Number(excluido.qty_pending) === 0, 'Sai das quantidades pendentes');
  conferir(perto(excluido.estimated_remaining, 0), 'Sai do valor estimado restante');
  conferir(perto(excluido.total_spent, 80), `Mas o histórico fica: ${brl(80)} continua gasto`);

  await comoUsuario(ana, `/rest/v1/items?id=eq.${pratos.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ excluded: false }),
  });

  /* ── 7 · Convite ──────────────────────────────────────────────────────── */

  titulo('7 · O código de pareamento liga o segundo aparelho');

  const pareamento = await rpc(ana, 'create_access_code', {
    p_space: espacoAna,
    p_kind: 'pareamento',
    p_label: 'celular do Bruno',
  });

  conferir(Boolean(pareamento?.code), `Código gerado: ${pareamento?.code}`);
  conferir(
    /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(pareamento.code),
    'Formato legível, sem I, L, O, zero e um',
    pareamento.code,
  );
  conferir(pareamento.uses_left === 1, 'Uso único');
  conferir(pareamento.expires_at !== null, 'Tem prazo de validade');

  let codigoErradoBarrado = false;
  try {
    await rpc(intruso, 'join_with_code', { p_code: 'ZZZZ-ZZZZ' });
  } catch {
    codigoErradoBarrado = true;
  }
  conferir(codigoErradoBarrado, 'Código inexistente é recusado');

  // Digitado torto de propósito: minúsculas, sem hífen, com espaços.
  const comoDigitado = `  ${pareamento.code.replace('-', '').toLowerCase()} `;
  const espacoAceito = await rpc(bruno, 'join_with_code', { p_code: comoDigitado });
  conferir(espacoAceito === espacoAna, 'Bruno entrou, mesmo digitando sem hífen e em minúsculas');

  let reusoBarrado = false;
  try {
    await rpc(intruso, 'join_with_code', { p_code: pareamento.code });
  } catch {
    reusoBarrado = true;
  }
  conferir(reusoBarrado, 'O mesmo código NÃO serve uma segunda vez');

  const itensDoBruno = await comoUsuario(bruno, `/rest/v1/items?space_id=eq.${espacoAna}&select=id`);
  conferir(itensDoBruno.length === 208, `Bruno enxerga os mesmos 208 itens (${itensDoBruno.length})`);

  const comprasDoBruno = await comoUsuario(
    bruno,
    `/rest/v1/purchases?space_id=eq.${espacoAna}&select=id,description`,
  );
  conferir(comprasDoBruno.length === 2, `Bruno enxerga as 2 compras da Ana (${comprasDoBruno.length})`);

  /* ── 7b · Código de recuperação ───────────────────────────────────────── */

  titulo('7b · O código de recuperação traz de volta quem perdeu o acesso');

  const recuperacao = await rpc(bruno, 'create_access_code', {
    p_space: espacoAna,
    p_kind: 'recuperacao',
    p_label: null,
  });

  conferir(
    recuperacao.uses_left === null && recuperacao.expires_at === null,
    'Reutilizável e sem prazo — é a chave de casa',
  );
  conferir(
    recuperacao.code.replace(/-/g, '').length === 12,
    `Mais longo que o de pareamento (${recuperacao.code.replace(/-/g, '').length} caracteres)`,
  );

  // Alguém limpou os dados do navegador: aparelho novo, identidade nova.
  const aparelhoNovo = await criarAparelho('ana-aparelho-novo');
  const voltou = await rpc(aparelhoNovo, 'join_with_code', { p_code: recuperacao.code });
  conferir(voltou === espacoAna, 'Um aparelho novo volta ao espaço com o código de recuperação');

  const itensDeVolta = await comoUsuario(
    aparelhoNovo,
    `/rest/v1/items?space_id=eq.${espacoAna}&select=id`,
  );
  conferir(itensDeVolta.length === 208, 'E enxerga tudo de novo');

  // Gerar outro invalida o anterior — serve para "trocar a fechadura".
  const novaRecuperacao = await rpc(ana, 'create_access_code', {
    p_space: espacoAna,
    p_kind: 'recuperacao',
    p_label: null,
  });
  conferir(novaRecuperacao.code !== recuperacao.code, 'Gerar outro produz um código diferente');

  const aindaHa = await comoUsuario(
    ana,
    `/rest/v1/space_codes?space_id=eq.${espacoAna}&kind=eq.recuperacao&select=code`,
  );
  conferir(aindaHa.length === 1, 'Só existe um código de recuperação por espaço');

  let antigoBarrado = false;
  try {
    const maisUm = await criarAparelho('terceiro');
    await rpc(maisUm, 'join_with_code', { p_code: recuperacao.code });
  } catch {
    antigoBarrado = true;
  }
  conferir(antigoBarrado, 'O código antigo deixa de funcionar na hora');

  const codigosVisiveis = await comoUsuario(
    intruso,
    `/rest/v1/space_codes?space_id=eq.${espacoAna}&select=code`,
  );
  conferir(
    codigosVisiveis.length === 0,
    'Quem está de fora não consegue listar códigos à procura de um válido',
  );

  /* ── 8 · Orçamento ────────────────────────────────────────────────────── */

  titulo('8 · Orçamento e saldo');

  const semOrcamento = await comoUsuario(ana, `/rest/v1/budgets?space_id=eq.${espacoAna}&select=id`);
  conferir(semOrcamento.length === 0, 'O espaço nasce sem orçamento definido (nada é inventado)');

  await rpc(bruno, 'set_budget', {
    p_space: espacoAna,
    p_kind: 'total',
    p_amount: 20000,
    p_category: null,
    p_month: null,
  });

  const [orcamento] = await comoUsuario(
    ana,
    `/rest/v1/budgets?space_id=eq.${espacoAna}&kind=eq.total&select=amount`,
  );
  conferir(perto(orcamento.amount, 20000), `Orçamento total = ${brl(20000)} (definido pelo Bruno)`);

  // Gasto efetivo = parcelas pagas. 80 (pratos, à vista) + 1080 (3 de 10) = 1160.
  const todosPagamentos = await comoUsuario(
    ana,
    `/rest/v1/payments?space_id=eq.${espacoAna}&select=amount`,
  );
  const totalGasto = todosPagamentos.reduce((s, p) => s + Number(p.amount), 0);
  conferir(
    perto(totalGasto, 1160),
    `Total efetivamente gasto = ${brl(1160)} (${brl(totalGasto)})`,
    'à vista 80,00 + 3 parcelas de 360,00',
  );
  conferir(perto(20000 - totalGasto, 18840), `Saldo do orçamento = ${brl(18840)}`);

  // Só uma linha de orçamento total por espaço.
  await rpc(ana, 'set_budget', {
    p_space: espacoAna,
    p_kind: 'total',
    p_amount: 25000,
    p_category: null,
    p_month: null,
  });
  const totais = await comoUsuario(
    ana,
    `/rest/v1/budgets?space_id=eq.${espacoAna}&kind=eq.total&select=amount`,
  );
  conferir(
    totais.length === 1 && perto(totais[0].amount, 25000),
    'Redefinir o orçamento atualiza a linha, não duplica',
  );

  /* ── 9 · Isolamento entre casais ──────────────────────────────────────── */

  titulo('9 · UM CASAL NÃO ENXERGA OS DADOS DO OUTRO');

  const tabelas = ['items', 'purchases', 'payments', 'installments', 'budgets', 'categories', 'space_members', 'space_codes', 'activity_log'];
  for (const tabela of tabelas) {
    // space_members tem chave composta, sem coluna "id".
    const coluna = tabela === 'space_members' ? 'user_id' : 'id';
    const vazou = await comoUsuario(
      intruso,
      `/rest/v1/${tabela}?space_id=eq.${espacoAna}&select=${coluna}&limit=5`,
    );
    conferir(vazou.length === 0, `${tabela}: o intruso não lê nada do casal A`, JSON.stringify(vazou).slice(0, 120));
  }

  let escritaBarrada = false;
  try {
    await comoUsuario(intruso, '/rest/v1/purchases', {
      method: 'POST',
      body: JSON.stringify({
        space_id: espacoAna,
        description: 'compra intrusa',
        qty: 1,
        total_paid: 999,
      }),
    });
  } catch {
    escritaBarrada = true;
  }
  conferir(escritaBarrada, 'O intruso não consegue INSERIR no espaço do casal A');

  let edicaoBarrada = false;
  try {
    const r = await comoUsuario(intruso, `/rest/v1/items?id=eq.${pratos.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'invadido' }),
    });
    edicaoBarrada = Array.isArray(r) && r.length === 0;
  } catch {
    edicaoBarrada = true;
  }
  conferir(edicaoBarrada, 'O intruso não consegue ALTERAR itens do casal A');

  const espacosDoIntruso = await comoUsuario(intruso, '/rest/v1/spaces?select=id,name');
  conferir(
    espacosDoIntruso.length === 1 && espacosDoIntruso[0].id === espacoIntruso,
    'O intruso só enxerga o próprio espaço',
    JSON.stringify(espacosDoIntruso.map((e) => e.name)),
  );

  const perfisVisiveis = await comoUsuario(intruso, '/rest/v1/profiles?select=id,display_name');
  conferir(
    !perfisVisiveis.some((p) => p.id === ana.id),
    'O intruso não enxerga o perfil de quem não divide espaço com ele',
  );

  /* ── 10 · Blindagem dos agregados ─────────────────────────────────────── */

  titulo('10 · O cliente não consegue adulterar os agregados financeiros');

  let adulteracaoBarrada = false;
  let mensagem = '';
  try {
    await comoUsuario(ana, `/rest/v1/items?id=eq.${geladeira.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ total_spent: 1 }),
    });
  } catch (e) {
    adulteracaoBarrada = true;
    mensagem = e.message;
  }
  conferir(adulteracaoBarrada, 'Escrever total_spent direto é recusado pelo banco', mensagem.slice(0, 90));

  const [intacta] = await comoUsuario(ana, `/rest/v1/items?id=eq.${geladeira.id}&select=total_spent`);
  conferir(perto(intacta.total_spent, 3600), `O valor continua ${brl(3600)}`);

  for (const campo of ['qty_bought', 'paid_amount']) {
    let barrado = false;
    try {
      await comoUsuario(ana, `/rest/v1/items?id=eq.${geladeira.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [campo]: 99 }),
      });
    } catch {
      barrado = true;
    }
    conferir(barrado, `Escrever ${campo} direto é recusado`);
  }

  /* ── Extra · integridade entre espaços ────────────────────────────────── */

  titulo('Extra · Integridade entre espaços');

  const [catIntruso] = await comoUsuario(intruso, `/rest/v1/categories?space_id=eq.${espacoIntruso}&select=id&limit=1`);
  let fkBarrada = false;
  try {
    await comoUsuario(ana, '/rest/v1/items', {
      method: 'POST',
      body: JSON.stringify({
        space_id: espacoAna,
        category_id: catIntruso.id, // categoria de outro espaço
        name: 'item com categoria alheia',
        qty_needed: 1,
      }),
    });
  } catch {
    fkBarrada = true;
  }
  conferir(fkBarrada, 'Apontar para a categoria de outro espaço é recusado');

  const historico = await comoUsuario(
    ana,
    `/rest/v1/activity_log?space_id=eq.${espacoAna}&select=entity,action&limit=200`,
  );
  conferir(historico.length > 0, `Histórico de alterações registrado (${historico.length} eventos)`);
}

/* ───────────────────────────── Execução ─────────────────────────────────── */

let erroFatal = null;
try {
  await executar();
} catch (e) {
  erroFatal = e;
  log(`\n  ${cor.vermelho}✗ Erro durante o teste:${cor.reset} ${e.message}`);
  falharam += 1;
} finally {
  await limpar().catch((e) => log(`  ${cor.vermelho}✗ Limpeza falhou:${cor.reset} ${e.message}`));
}

log('');
const total = passaram + falharam;
if (falharam === 0) {
  log(`${cor.verde}${cor.bold}✓ ${passaram}/${total} verificações passaram contra o banco real.${cor.reset}`);
} else {
  log(`${cor.vermelho}${cor.bold}✗ ${falharam} de ${total} verificações falharam.${cor.reset}`);
}

process.exit(falharam === 0 && !erroFatal ? 0 : 1);
