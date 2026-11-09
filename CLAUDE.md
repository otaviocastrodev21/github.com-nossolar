# Nosso Lar — contexto do projeto para o Claude Code

> Relatório de passagem escrito em 06/11/2026, ao fim da primeira série de
> sessões. Descreve o que o projeto é, como está montado, o que já foi feito, o
> que está pendente e as regras combinadas com o dono. O `README.md` é a
> documentação técnica completa (esquema, RPCs, decisões de gráfico, testes);
> este arquivo é o resumo operacional.

## 1. O que é

Aplicativo do casal para controlar o **enxoval da casa nova**: checklist de
itens em **três listas** (enxoval, primeira compra, materiais de construção), compras (com parcelas), orçamento por categoria, pendências,
comparativo de preços entre lojas e relatórios (Excel/PDF/CSV). Sincroniza em
tempo real entre os aparelhos dos dois.

- **Dono:** otaviocastrodev21 (otaviocastrodev@gmail.com). Fala português do
  Brasil; não é preciso tom técnico — explique o efeito para quem usa.
- **Interface, comentários do código, mensagens de commit: em português.**
- Roda em três formas, do mesmo código:
  1. **Site** na Vercel: https://githubcom-nossolar.vercel.app (publica sozinho
     a cada `git push` na `main`).
  2. **App instalável pelo navegador** (PWA), inclusive no celular.
  3. **App de computador** (Electron) — instaladores Windows em `release/`
     (x64, arm64, universal, portátil). **Não se atualiza sozinho**: muda só
     reinstalando.
- **Repositório:** https://github.com/otaviocastrodev21/github.com-nossolar
  (público; o dono havia pedido privado — avisado, decisão dele).

## 2. Stack e comandos

React 18 + TypeScript + Vite 5 + Tailwind 3 · Supabase (Postgres, Auth, RLS,
Realtime) · Recharts · SheetJS/jsPDF · Electron 33 · vite-plugin-pwa · Vitest.

```
npm run dev                # Vite em http://localhost:5173
npm run verify             # typecheck + testes (111) + build — rode antes de commitar
npm run desktop:verify     # monta e abre o Electron com --smoke; precisa imprimir "ok": true
npm run desktop:dist:win   # gera os 4 instaladores em release/
npm run gen:catalog        # regera 0004_catalog_seed.sql e schema.sql a partir de supabase/catalog.mjs
```

Ambiente do dono: **Windows 11**. O shell Bash é Git Bash — ao passar rotas
como "/checklist" para programas, use `MSYS_NO_PATHCONV=1`, senão viram
caminhos de pasta. Para abrir o Electron a partir do Bash:
`env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/electron.exe <pasta>`.

## 3. Mapa do código

```
src/
  App.tsx                 porteira: sem Supabase → SetupScreen; sem conta → AuthScreen; senão o app
  contexts/
    SessionContext.tsx    conta (e-mail+senha); converte sessão anônima antiga em conta
    SpaceContext.tsx      carrega o espaço, Realtime, todas as mutações; devolve a primeira compra
    ToastContext.tsx
  pages/                  Dashboard, Checklist, Purchases, Pending, Finance, Reports, Settings, AuthScreen
  components/
    layout/AppShell.tsx   barra lateral, topo, rodapé do celular, tema, comemoração (confete)
    layout/AppStatus.tsx  sem conexão, "nova versão disponível" (PWA), convite para instalar
    checklist/            ItemDetail (detalhe do item), ItemForm, QuoteComparison (cotações)
    dashboard/            figures (AnimatedNumber, ProgressRing, Meter, StatTile…), charts (Recharts)
    ui/                   primitives (Button, Card, Logo…), form, Modal
  lib/
    calc.ts               computeOverview: todos os números do painel (fonte única das contagens)
    quotes.ts             comparação de cotações, nome da loja a partir do link
    lists.ts              as 3 listas (pela letra da categoria) e quem conta na porcentagem
    restoreFirstPurchase.ts  devolve a lista da primeira compra a espaços que a perderam
    theme.ts motion.ts celebrate.ts   tema claro/escuro, número que sobe, luz do mouse, confete
    viz.ts                cores dos gráficos (variáveis CSS, valem nos dois temas)
supabase/
  catalog.mjs             FONTE da lista inicial (14 categorias, 208 linhas); tipos em catalog.d.mts,
                          importado também pelo app (restoreFirstPurchase.ts)
  migrations/0001…0007    esquema, funções, RLS, catálogo, ensure_space, perfil, cotações
electron/main.cjs         janela, CSP restrita, protocolo próprio, modo --smoke
scripts/                  provisionamento do Supabase, teste de integração, ícones, desktop
```

## 4. Supabase

- Projeto: **`rcfcznxgqifqwtillyjt`** (plano gratuito,
  **sem backup** — o que se apaga não volta).
- **Não mexer** nos outros projetos da conta (Landing Page `nekficffptthjsczvhxv`,
  ComandAI); estão pausados.
- Chaves: `.env` (local, fora do Git) e `.env.production` (versionado, só URL e
  chave **anon**, que é pública por desenho; a `service_role` nunca vai para o
  código).
- **Token de gerenciamento:** o dono **revogou** os tokens usados até aqui. Para
  rodar SQL ou mexer em configuração, peça um novo
  (https://supabase.com/dashboard/account/tokens), guarde em `.supabase-token`
  (está no `.gitignore`) e use a API `POST /v1/projects/<ref>/database/query`.
- Auth: provedor **e-mail ligado**, **confirmação por e-mail desligada** (o SMTP
  do plano gratuito só entrega para a equipe do projeto), senha mínima 8,
  sessões anônimas ligadas só para os aparelhos antigos virarem conta. Não há
  "esqueci a senha" (precisaria de SMTP próprio, ex.: Resend).
- Modelo: cada pessoa tem conta; o **espaço** é a lista do casal. Membros entram
  por código de pareamento (24 h, uso único) ou de recuperação. Tudo é protegido
  por RLS com `is_space_member(space_id)`. `ensure_space()` cria o espaço no
  primeiro login, com lock para não duplicar.
- Migrações aplicadas no banco: **0001–0007** (todas as que existem). Uma 0008
  chegou a existir (tirar mercado do catálogo), nunca foi aplicada e foi
  removida quando a lista de mercado voltou.

## 5. Histórico (commits na ordem)

1. `b28ca0d` Base do app (checklist, compras, parcelas, orçamento, relatórios, PWA, Electron).
2. `f2f4d65` A pedido: **sem login** — sessão anônima, abria direto no painel.
3. `331f07d` Recuperação quando a identidade anônima sumia do banco.
4. `ad08c0c` **Responsividade** celular/tablet (auditada em 360/390/768/1024 px).
5. `869e2ee` Vercel conectada ao banco (`.env.production`, `vercel.json` com rewrite de SPA).
6. `7ca95d3` A pedido: **login de volta** (e-mail+senha). Motivo: sem conta, app e
   site eram espaços separados. Sessão anônima antiga vira conta sem perder dados.
7. `c5987c2` **Visual novo** "Lar aconchegante" (creme/madeira/oliva, vidro, aurora,
   tema escuro, animações, confete). Tons são variáveis CSS com rampas invertidas
   no escuro — não use cores fixas (`#hex`) em componentes; use as classes do tema.
8. `cf1a02b` **Desempenho**: a luz do mouse travava o Checklist (p95 142 ms →
   17 ms). Causas: aurora animada + barras com backdrop-filter, blur em todos os
   cartões, degradê reposicionado por variável herdada. Regras que ficaram:
   aurora parada, cartões sem backdrop-filter, vidro só no topo e rodapé do
   celular, luz é um elemento único movido por transform e desligada em
   cartões com mais de 640 px de altura. **Não reintroduza** essas causas.
9. `9e89699` **Comparativo de preços**: cotações por item (loja, preço, frete,
   link). Ordena por preço final, diz "Site 2 está mais barato: R$ 20,00 a menos
   que Site 1 (4%)". Preenchimento manual — buscar preço nos sites sozinho foi
   descartado (lojas não oferecem API aberta, bloqueiam robôs, itens são
   genéricos). Também: ItemDetail passou a ler o item atualizado do contexto.
10. `ab6988a` A pedido: **tirar compras de mercado** (primeira compra de
    supermercado, produtos de limpeza, higiene pessoal: 3 categorias, 34 itens).
    Catálogo foi a 11 categorias / 174 linhas e o app limpava os espaços ao abrir.
    **Desfeito no item 13** — não existe mais (`retiredItems.ts` saiu).
11. `4016db4` A pedido: **"não será comprado" fora de todas as contagens** (total,
    concluídos, porcentagem, barra de situação, por categoria). A porcentagem já
    era por unidades ativas; as contagens de itens é que incluíam.
12. `9ae0c11` **Versão visível** em Configurações → Aparência ("9ae0c11 ·
    06/11/2026") e PWA procurando atualização a cada 20 min e ao voltar à aba.
    Motivo: o dono viu "13 de 168 itens" numa versão antiga ainda aberta.
13. (09/11) A pedido: **três listas**, cada uma com contagem e porcentagem próprias,
    nas abas do Checklist (`?lista=itens|pc|construcao`), na barra lateral e no Painel:
    - **Checklist itens** (enxoval): todas as categorias, exceto as abaixo.
    - **Checklist P.C** (primeira compra): G Produtos de limpeza, M Higiene pessoal,
      N Primeira compra de supermercado. **Desfaz o item 10**: a lista de mercado
      voltou ao catálogo e o app a devolve aos espaços que a perderam (só recria a
      categoria ausente por inteiro, com os itens originais).
    - **Materiais de construção**: K Ferramentas e manutenção (trena, nível, primeiros
      socorros, fixação, elétrica).
    - **Itens opcionais saem da contagem e da porcentagem** em todas as listas, como
      "não será comprado" e tarefas. Regra única em `countsInProgress` (lists.ts).
    - Dinheiro (gasto, orçamento, estimado) continua somando as três listas.
14. (09/11) **Porcentagem = itens concluídos ÷ itens que contam** (o mesmo "10 de 74"
    da tela), não mais por unidades — 30 cabides pesavam como 30. Item parcial não
    conta como concluído. `percentPoints` mostra uma casa decimal ("13,5%").

## 6. Pendências e pontos em aberto

- **Não testado contra o banco real** (sem token): a devolução da lista da
  primeira compra e as três porcentagens. A regra tem testes unitários. Confirmar
  com o dono que as abas e as porcentagens aparecem e que os 34 itens voltaram.
- O app de computador do dono precisa ser **reinstalado** a cada versão.
- Ideias não feitas (só se o dono pedir): "esqueci a senha" com SMTP próprio;
  auto-atualização do Electron; publicar nas lojas com Capacitor.

## 7. Regras combinadas (respeite)

- **No banco real, apague só o que o seu teste criou, pelo id anotado.** Nunca
  "apagar todos os espaços/usuários". Em 03/11 uma limpeza ampla apagou um espaço
  real do dono — sem backup. Contas de teste usam e-mail
  `teste-visual-<timestamp>@example.com` / `teste-ui-…`; apague o espaço com
  `created_by = <id>` e o usuário com `id = <id> and email like 'teste-%@example.com'`.
  Antes de qualquer delete, liste e compare `created_at` com a hora do seu teste.
- Hoje existem **3 espaços reais** no banco (não apagar).
- Antes de commitar: `npm run verify`. Para mudança visual, olhar de verdade
  (capturas em 390 px e 1280 px, claro e escuro) — testes não pegam layout.
- Depois de mudança relevante: `git push` (dispara a Vercel),
  `npm run desktop:dist:win` e `npm run desktop:verify` ("ok": true).
- Commits terminam com a linha de coautoria indicada pela sessão.
- Não reintroduzir cores fixas, blur em cartões, animação contínua de fundo.
- A lista de uma categoria vem da **letra** (`lists.ts`); categoria nova do casal
  cai no enxoval. Para mover uma categoria de lista, mude o mapa ali.
- Mudança de catálogo: edite `supabase/catalog.mjs`, rode `npm run gen:catalog`,
  crie migração nova para o banco e atualize as contagens (Settings, SetupScreen,
  scripts de verificação, README).

## 8. Como testar no app de verdade (sem depender do dono)

Funcionou bem, nas sessões anteriores, um script Electron descartável (fora do
repositório, na pasta temporária da sessão):

1. Subir `npx vite --port 5199 --strictPort --host 127.0.0.1`.
2. Criar conta de teste com `supabase-js` e a chave anon (`signUp` já devolve
   sessão, porque a confirmação de e-mail está desligada).
3. Abrir uma `BrowserWindow` fora da tela (`x: -4000`, `show: true` — janela
   oculta trava o `executeJavaScript`), gravar a sessão em
   `localStorage['nosso-lar-auth']` e o tema em `localStorage['nosso-lar-tema']`.
4. Para celular, emular com o DevTools Protocol
   (`Emulation.setDeviceMetricsOverride` com `mobile: true` e
   `setTouchEmulationEnabled`).
5. Preencher campos React com o setter nativo de `value` + evento `input`.
6. Capturar com `webContents.capturePage()` e olhar as imagens.
7. No fim: apagar só a conta e o espaço criados (exige token de gerenciamento —
   sem ele, não crie conta de teste no banco real).

Para desempenho: medir intervalos de `requestAnimationFrame` enquanto se envia
`Input.dispatchMouseEvent` e comparar o p95 ligando/desligando efeitos com CSS
injetado; `Emulation.setCPUThrottlingRate` simula máquina lenta.
