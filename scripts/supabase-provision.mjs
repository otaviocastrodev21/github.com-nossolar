#!/usr/bin/env node
/**
 * Prepara um projeto Supabase para o Nosso Lar, de ponta a ponta.
 *
 * Usa a API de gerenciamento do Supabase para criar (ou reaproveitar) um
 * projeto, executar as quatro migrações na ordem, conferir que o banco ficou
 * como deveria e gravar o `.env` com as chaves certas.
 *
 * ── Como usar ──────────────────────────────────────────────────────────────
 *
 *   1. Gere um token em https://supabase.com/dashboard/account/tokens
 *   2. Exporte-o (nunca passe como argumento: fica no histórico do terminal):
 *
 *        export SUPABASE_ACCESS_TOKEN=sbp_...        # macOS / Linux
 *        $env:SUPABASE_ACCESS_TOKEN = "sbp_..."      # PowerShell
 *
 *   3. Rode uma das formas:
 *
 *        node scripts/supabase-provision.mjs --listar
 *        node scripts/supabase-provision.mjs --criar --nome "Nosso Lar"
 *        node scripts/supabase-provision.mjs --projeto <ref>
 *
 * ── Opções ────────────────────────────────────────────────────────────────
 *
 *   --diagnosticar      mostra o que este token consegue (e não consegue) fazer
 *   --listar            mostra organizações e projetos da conta
 *   --criar             cria um projeto novo
 *   --projeto <ref>     usa um projeto existente
 *   --nome <texto>      nome do projeto novo        (padrão: "Nosso Lar")
 *   --regiao <id>       região do projeto novo      (padrão: sa-east-1, São Paulo)
 *   --org <id>          organização                 (padrão: a única, se houver só uma)
 *   --senha <texto>     senha do banco              (padrão: gerada aqui e exibida)
 *   --so-verificar      não executa migração, só confere o estado do banco
 *   --sem-env           não grava o arquivo .env
 *
 * O token só é lido da variável de ambiente e nunca é impresso.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.supabase.com';

/* ────────────────────────────── Argumentos ──────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (nome) => argv.includes(`--${nome}`);
const valor = (nome, padrao = null) => {
  const i = argv.indexOf(`--${nome}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : padrao;
};

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

/* ──────────────────────────── Saída no terminal ─────────────────────────── */

const cor = {
  reset: '[0m',
  dim: '[2m',
  bold: '[1m',
  verde: '[32m',
  amarelo: '[33m',
  vermelho: '[31m',
};

const log = (msg = '') => console.log(msg);
const passo = (msg) => log(`\n${cor.bold}▸ ${msg}${cor.reset}`);
const ok = (msg) => log(`  ${cor.verde}✓${cor.reset} ${msg}`);
const aviso = (msg) => log(`  ${cor.amarelo}!${cor.reset} ${msg}`);
const erro = (msg) => log(`  ${cor.vermelho}✗${cor.reset} ${msg}`);
const nota = (msg) => log(`    ${cor.dim}${msg}${cor.reset}`);

function morrer(msg, detalhe) {
  erro(msg);
  if (detalhe) nota(detalhe);
  process.exit(1);
}

/* ───────────────────────── Chamadas à API ───────────────────────────────── */

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opcoes.headers,
    },
  });

  const texto = await resposta.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }

  if (!resposta.ok) {
    const detalhe =
      typeof corpo === 'string' ? corpo : (corpo?.message ?? corpo?.error ?? JSON.stringify(corpo));
    const dica =
      resposta.status === 401
        ? ' — o token está inválido ou expirou.'
        : resposta.status === 403 && caminho === '/v1/projects'
          ? '\n    Este token não pode CRIAR projetos.'
          : resposta.status === 403
            ? ' — o token não tem permissão para esta operação.'
            : '';
    throw new Error(`${resposta.status} ${caminho}${dica}\n    ${detalhe}`);
  }

  return corpo;
}

/** Executa SQL no banco do projeto. */
async function sql(ref, query) {
  return api(`/v1/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────── Fluxos ─────────────────────────────────────── */

/**
 * Diz o que o token consegue fazer, em vez de deixar a pessoa adivinhar a
 * partir de um "403 Forbidden" seco.
 *
 * O Supabase tem dois tipos de token com o mesmo prefixo `sbp_`:
 *   · de conta  (user-scoped) — criado em /account/tokens, pode criar projetos;
 *   · de recurso            — criado dentro de uma organização ou projeto,
 *                             enxerga só aquele recurso.
 * A diferença só aparece quando uma operação falha, então checamos antes.
 */
async function diagnosticar() {
  const tentar = async (method, caminho, body) => {
    try {
      const resposta = await fetch(`${API}${caminho}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const texto = await resposta.text();
      return { status: resposta.status, texto };
    } catch (e) {
      return { status: 0, texto: e.message };
    }
  };

  passo('Que tipo de token é este');

  const perfil = await tentar('GET', '/v1/profile');
  const deConta = perfil.status === 200;

  if (deConta) {
    ok('Token de conta (user-scoped) — pode criar projetos');
  } else if (perfil.texto.includes('user-scoped')) {
    erro('Token de RECURSO, não de conta');
    nota('Ele enxerga apenas a organização ou o projeto em que foi criado.');
    nota('Para criar projetos, gere um em https://supabase.com/dashboard/account/tokens');
  } else {
    aviso(`Não deu para identificar (${perfil.status}).`);
  }

  passo('O que ele alcança');

  const orgsVistas = new Set();
  const projetos = await tentar('GET', '/v1/projects');

  if (projetos.status === 200) {
    const lista = JSON.parse(projetos.texto);
    ok(`Enxerga ${lista.length} projeto(s)`);
    for (const p of lista) {
      nota(`${p.name} — ${p.id} — ${p.region} — ${p.status}`);
      if (p.organization_id) orgsVistas.add(p.organization_id);
    }
  } else {
    erro(`Não consegue listar projetos (${projetos.status})`);
  }

  const orgs = await tentar('GET', '/v1/organizations');
  if (orgs.status === 200) {
    const lista = JSON.parse(orgs.texto);
    if (lista.length > 0) {
      ok(`Enxerga ${lista.length} organização(ões)`);
      for (const o of lista) nota(`${o.name} — ${o.id}`);
    } else {
      aviso('A lista de organizações volta vazia');
      if (orgsVistas.size > 0) {
        nota(`…mesmo os projetos pertencendo a: ${[...orgsVistas].join(', ')}`);
        nota('Isso é o padrão de um token preso a um projeto, não à conta.');
      }
    }
  }

  // Sem uma organização real para testar, o resultado não significaria nada:
  // um id inventado devolve 404 e pareceria permissão concedida.
  if (orgsVistas.size === 0) {
    passo('Pode criar projetos?');
    aviso('Sem organização visível para testar de verdade.');
    return;
  }

  passo('Pode criar projetos na organização de vocês?');

  for (const orgId of orgsVistas) {
    // Região inválida de propósito: nada é criado em nenhum caso.
    //   400 → autorizado, só o payload é que está errado
    //   403 → o token não pode criar projetos nesta organização
    const criar = await tentar('POST', '/v1/projects', {
      name: 'sonda-de-permissao',
      organization_id: orgId,
      region: 'regiao-que-nao-existe',
      plan: 'free',
      db_pass: 'Sonda-nao-cria-nada-123',
    });

    if (criar.status === 400) {
      ok(`${orgId}: sim (validou o payload — nada foi criado)`);
    } else if (criar.status === 403) {
      erro(`${orgId}: não — criação barrada nesta organização`);
    } else if (criar.status === 404) {
      aviso(`${orgId}: organização não encontrada pelo token`);
    } else {
      aviso(`${orgId}: resposta inesperada (${criar.status})`);
    }
  }

  log('');
  nota('Nenhum projeto foi criado ou alterado por este diagnóstico.');
}

async function listar() {
  passo('Organizações');
  const orgs = await api('/v1/organizations');
  if (orgs.length === 0) {
    aviso('Nenhuma organização encontrada.');
  }
  for (const org of orgs) log(`  ${org.name}  ${cor.dim}${org.id}${cor.reset}`);

  passo('Projetos');
  const projetos = await api('/v1/projects');
  if (projetos.length === 0) {
    aviso('Nenhum projeto ainda. Use --criar.');
    return;
  }
  for (const p of projetos) {
    log(
      `  ${p.name.padEnd(24)} ${cor.dim}${p.id}${cor.reset}  ${p.region}  ${
        p.status === 'ACTIVE_HEALTHY' ? cor.verde + p.status + cor.reset : p.status
      }`,
    );
  }
}

async function criarProjeto() {
  const orgs = await api('/v1/organizations');
  let orgId = valor('org');

  if (!orgId) {
    if (orgs.length === 0) morrer('Nenhuma organização na conta.', 'Crie uma no painel do Supabase.');
    if (orgs.length > 1) {
      erro('A conta tem mais de uma organização. Escolha com --org <id>:');
      for (const org of orgs) nota(`${org.name}  ${org.id}`);
      process.exit(1);
    }
    orgId = orgs[0].id;
    ok(`Organização: ${orgs[0].name}`);
  }

  const nome = valor('nome', 'Nosso Lar');
  const regiao = valor('regiao', 'sa-east-1');
  // Senha forte gerada aqui; o usuário precisa guardá-la.
  const senha = valor('senha') ?? `NL-${randomBytes(18).toString('base64url')}`;

  passo(`Criando o projeto "${nome}" em ${regiao}`);
  nota('A primeira criação leva de 1 a 3 minutos.');

  let projeto;
  try {
    projeto = await api('/v1/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: nome,
        organization_id: orgId,
        region: regiao,
        plan: 'free',
        db_pass: senha,
      }),
    });
  } catch (e) {
    if (String(e.message).includes('403')) {
      erro('Este token não tem permissão para criar projetos.');
      log('');
      nota('Saída mais simples — crie o projeto pelo painel e volte aqui:');
      nota('  1. https://supabase.com/dashboard → New project');
      nota(`  2. Nome "${nome}", região South America (São Paulo)`);
      nota('  3. node scripts/supabase-provision.mjs --listar     (acha o ref)');
      nota('  4. node scripts/supabase-provision.mjs --projeto <ref>');
      log('');
      nota('Alternativa: gere um token com permissão total em');
      nota('https://supabase.com/dashboard/account/tokens');
      process.exit(1);
    }
    throw e;
  }

  ok(`Projeto criado: ${projeto.id}`);
  log('');
  log(`  ${cor.bold}GUARDE A SENHA DO BANCO:${cor.reset} ${senha}`);
  nota('Ela não é exibida de novo. Serve para conexão direta ao Postgres.');

  // Espera o banco subir.
  passo('Aguardando o banco ficar disponível');
  const limite = Date.now() + 6 * 60 * 1000;
  let estado = projeto.status;

  while (Date.now() < limite) {
    if (estado === 'ACTIVE_HEALTHY') break;
    await dormir(10_000);
    try {
      const atual = await api(`/v1/projects/${projeto.id}`);
      if (atual.status !== estado) {
        estado = atual.status;
        nota(`estado: ${estado}`);
      }
    } catch {
      nota('ainda provisionando…');
    }
  }

  if (estado !== 'ACTIVE_HEALTHY') {
    morrer(
      'O projeto não ficou pronto a tempo.',
      `Último estado: ${estado}. Rode de novo com --projeto ${projeto.id} quando ele estiver ativo.`,
    );
  }

  ok('Banco disponível');
  return projeto.id;
}

/* ───────────────────────── Migrações ────────────────────────────────────── */

const MIGRACOES = [
  ['0001_schema.sql', 'tabelas, chaves, índices e colunas calculadas'],
  ['0002_functions.sql', 'triggers financeiros e funções (RPC)'],
  ['0003_rls.sql', 'Row Level Security, permissões por coluna e Realtime'],
  ['0004_catalog_seed.sql', 'lista inicial do enxoval'],
  ['0005_ensure_space.sql', 'o espaço do primeiro uso, criado sozinho e só uma vez'],
  ['0006_account_profile_sync.sql', 'e-mail e nome do perfil acompanham a conta'],
  ['0007_item_quotes.sql', 'comparativo de preços: cotações por item'],
];

async function migrar(ref) {
  passo('Executando as migrações');

  for (const [arquivo, descricao] of MIGRACOES) {
    const caminho = join(root, 'supabase', 'migrations', arquivo);
    if (!existsSync(caminho)) morrer(`Migração não encontrada: ${arquivo}`);

    const conteudo = readFileSync(caminho, 'utf8');
    process.stdout.write(`  ${arquivo.padEnd(26)} ${cor.dim}${descricao}${cor.reset} … `);

    try {
      await sql(ref, conteudo);
      log(`${cor.verde}ok${cor.reset}`);
    } catch (e) {
      log(`${cor.vermelho}falhou${cor.reset}`);
      morrer(`Erro em ${arquivo}`, e.message);
    }
  }
}

/* ───────────────────────── Verificação ──────────────────────────────────── */

const ESPERADO = {
  tabelas: [
    'activity_log',
    'budgets',
    'catalog_categories',
    'catalog_items',
    'categories',
    'extra_expenses',
    'installments',
    'items',
    'payments',
    'profiles',
    'purchases',
    'space_codes',
    'space_members',
    'spaces',
  ],
  funcoes: [
    'assert_category_in_space',
    'create_access_code',
    'create_space',
    'gen_access_code',
    'join_with_code',
    'is_space_member',
    'is_space_owner',
    'leave_space',
    'recalc_item',
    'seed_space_catalog',
    'set_budget',
    'shares_space_with',
  ],
  colunasGeradas: [
    'avg_unit_paid',
    'estimated_remaining',
    'estimated_total',
    'qty_pending',
    'savings',
    'status',
  ],
};

async function verificar(ref) {
  passo('Conferindo o banco');
  let problemas = 0;

  const checar = (condicao, bom, ruim) => {
    if (condicao) ok(bom);
    else {
      erro(ruim);
      problemas += 1;
    }
  };

  // ── Tabelas
  const tabelas = await sql(
    ref,
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  const nomes = tabelas.map((r) => r.table_name);
  const faltando = ESPERADO.tabelas.filter((t) => !nomes.includes(t));
  checar(
    faltando.length === 0,
    `${nomes.length} tabelas criadas`,
    `Faltam tabelas: ${faltando.join(', ')}`,
  );

  // ── RLS ligado em todas
  const semRls = await sql(
    ref,
    `select relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      order by relname`,
  );
  checar(
    semRls.length === 0,
    'Row Level Security ligado em todas as tabelas',
    `Sem RLS: ${semRls.map((r) => r.relname).join(', ')}`,
  );

  // ── Políticas
  const politicas = await sql(
    ref,
    `select tablename, count(*)::int as total from pg_policies
      where schemaname = 'public' group by tablename order by tablename`,
  );
  const totalPoliticas = politicas.reduce((s, r) => s + r.total, 0);
  checar(totalPoliticas >= 25, `${totalPoliticas} políticas de acesso`, 'Poucas políticas criadas');

  // ── Funções
  const funcoes = await sql(
    ref,
    `select routine_name from information_schema.routines
      where routine_schema = 'public' order by routine_name`,
  );
  const nomesFn = funcoes.map((r) => r.routine_name);
  const fnFaltando = ESPERADO.funcoes.filter((f) => !nomesFn.includes(f));
  checar(
    fnFaltando.length === 0,
    `${nomesFn.length} funções criadas`,
    `Faltam funções: ${fnFaltando.join(', ')}`,
  );

  // ── Triggers
  const triggers = await sql(
    ref,
    `select tgname from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal order by tgname`,
  );
  checar(triggers.length >= 12, `${triggers.length} triggers ativos`, 'Triggers faltando');

  // ── Colunas geradas de `items` (o coração da consistência)
  const geradas = await sql(
    ref,
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'items'
        and is_generated = 'ALWAYS' order by column_name`,
  );
  const nomesGer = geradas.map((r) => r.column_name);
  const gerFaltando = ESPERADO.colunasGeradas.filter((c) => !nomesGer.includes(c));
  checar(
    gerFaltando.length === 0,
    `Colunas calculadas pelo banco: ${nomesGer.join(', ')}`,
    `Faltam colunas geradas: ${gerFaltando.join(', ')}`,
  );

  // ── Blindagem: o cliente não pode escrever os agregados
  const proibidas = await sql(
    ref,
    `select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'items'
        and grantee = 'authenticated' and privilege_type = 'UPDATE'
        and column_name in ('qty_bought', 'total_spent', 'paid_amount')`,
  );
  checar(
    proibidas.length === 0,
    'Agregados financeiros protegidos (cliente não pode escrever)',
    `O cliente consegue escrever: ${proibidas.map((r) => r.column_name).join(', ')}`,
  );

  // ── Catálogo
  const [{ categorias }] = await sql(ref, 'select count(*)::int as categorias from public.catalog_categories');
  const [{ itens }] = await sql(ref, 'select count(*)::int as itens from public.catalog_items');
  const [{ tarefas }] = await sql(
    ref,
    'select count(*)::int as tarefas from public.catalog_items where is_task',
  );
  checar(categorias === 14, `${categorias} categorias no catálogo`, `Esperava 14 categorias, achei ${categorias}`);
  checar(itens === 208, `${itens} linhas do enxoval (${itens - tarefas} produtos + ${tarefas} tarefas)`, `Esperava 208 linhas, achei ${itens}`);

  // ── Nenhum preço inventado, nenhuma compra fictícia
  const [{ comPreco }] = await sql(
    ref,
    'select count(*)::int as "comPreco" from public.catalog_items where qty <= 0',
  );
  checar(comPreco === 0, 'Nenhuma quantidade inválida no catálogo', `${comPreco} linhas com quantidade inválida`);

  // ── Realtime
  const realtime = await sql(
    ref,
    `select tablename from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' order by tablename`,
  );
  checar(
    realtime.length >= 8,
    `Realtime ativo em ${realtime.length} tabelas`,
    `Realtime ativo em apenas ${realtime.length} tabelas`,
  );

  // ── O gatilho que cria o perfil ao cadastrar o usuário
  const authTrigger = await sql(
    ref,
    `select tgname from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'auth' and c.relname = 'users' and tgname = 'on_auth_user_created'`,
  );
  checar(
    authTrigger.length === 1,
    'Gatilho de criação de perfil instalado em auth.users',
    'Gatilho on_auth_user_created não encontrado',
  );

  return problemas;
}

/* ───────────────────────── Chaves e .env ────────────────────────────────── */

async function gravarEnv(ref) {
  passo('Chaves do projeto');

  let chaves;
  try {
    chaves = await api(`/v1/projects/${ref}/api-keys?reveal=true`);
  } catch {
    chaves = await api(`/v1/projects/${ref}/api-keys`);
  }

  const anon = chaves.find((k) => k.name === 'anon' || k.name === 'anon_key' || k.type === 'anon');
  if (!anon?.api_key) {
    aviso('Não consegui ler a chave anon pela API.');
    nota(`Pegue em: https://supabase.com/dashboard/project/${ref}/settings/api`);
    return null;
  }

  const url = `https://${ref}.supabase.co`;
  ok(`URL: ${url}`);
  ok(`Chave anon lida (${anon.api_key.slice(0, 12)}…)`);

  if (flag('sem-env')) {
    nota('--sem-env: o arquivo .env não foi alterado.');
    return { url, anon: anon.api_key };
  }

  const caminho = join(root, '.env');
  writeFileSync(
    caminho,
    `# Gerado por scripts/supabase-provision.mjs\n` +
      `# Projeto: ${ref}\n\n` +
      `VITE_SUPABASE_URL=${url}\n` +
      `VITE_SUPABASE_ANON_KEY=${anon.api_key}\n`,
    'utf8',
  );
  ok('.env gravado');
  nota('A chave anon é pública por natureza — quem protege os dados é o RLS.');

  return { url, anon: anon.api_key };
}

/* ─────────────────────────────── Principal ──────────────────────────────── */

async function principal() {
  if (!token) {
    morrer(
      'Faltou o token de acesso.',
      'Gere em https://supabase.com/dashboard/account/tokens e exporte como SUPABASE_ACCESS_TOKEN.',
    );
  }

  log(`${cor.bold}Nosso Lar — preparação do Supabase${cor.reset}`);

  if (flag('diagnosticar')) {
    await diagnosticar();
    return;
  }

  if (flag('listar')) {
    await listar();
    return;
  }

  let ref = valor('projeto');

  if (!ref && flag('criar')) {
    ref = await criarProjeto();
  }

  if (!ref) {
    morrer(
      'Informe o que fazer.',
      'Use --listar, --criar ou --projeto <ref>. Veja o cabeçalho do arquivo para as opções.',
    );
  }

  const projeto = await api(`/v1/projects/${ref}`);
  ok(`Projeto: ${projeto.name} (${projeto.region}) — ${projeto.status}`);

  if (projeto.status !== 'ACTIVE_HEALTHY') {
    morrer(`O projeto está em "${projeto.status}".`, 'Espere ficar ACTIVE_HEALTHY e rode de novo.');
  }

  if (!flag('so-verificar')) {
    await migrar(ref);
  }

  const problemas = await verificar(ref);
  const chaves = await gravarEnv(ref);

  log('');
  if (problemas === 0) {
    log(`${cor.verde}${cor.bold}✓ Banco pronto.${cor.reset}`);
    if (chaves) {
      log('');
      log('  Próximos passos:');
      nota('npm run dev          → abrir no navegador');
      nota('npm run desktop:dist → gerar o instalador já conectado');
      log('');
      nota(`Painel: https://supabase.com/dashboard/project/${ref}`);
    }
  } else {
    log(`${cor.vermelho}${cor.bold}✗ ${problemas} verificação(ões) falharam.${cor.reset}`);
    process.exit(1);
  }
}

principal().catch((e) => {
  log('');
  morrer('Falhou.', e.message);
});
