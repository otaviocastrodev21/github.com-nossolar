# Nosso Lar

**Nosso enxoval, nossos planos.**

Sistema para um casal montar a casa: controla o enxoval item por item, as
compras já feitas, os valores gastos, o orçamento disponível e o que ainda
falta. As duas pessoas acessam a mesma lista, das próprias contas, com
sincronização entre dispositivos.

**Roda em qualquer sistema**, de três formas, com o mesmo código e os mesmos
dados:

| Como | Onde | O que é |
|---|---|---|
| **No navegador** | qualquer um | Abre pelo endereço, sem instalar nada |
| **Instalado pelo navegador** (PWA) | Windows, macOS, Linux, Android, iPhone, iPad | Ícone próprio, janela sem barra de endereço, abre offline |
| **Aplicativo de computador** | Windows, macOS, Linux | Instalador nativo: `.exe`, `.dmg`, `.AppImage`, `.deb`, `.rpm` |

**Sem cadastro e sem senha.** Não há tela de login: o aparelho ganha uma
identidade própria no primeiro uso, e a segunda pessoa entra com um código.
A proteção entre casais continua inteira — ver
[seção 3](#3-como-o-casal-compartilha-a-lista).

- **React + TypeScript + Tailwind CSS** na interface
- **Supabase** (PostgreSQL + sessões anônimas + Realtime + Row Level Security)
- **Electron** no aplicativo de computador, **Workbox** no aplicativo instalável
- **Recharts** nos gráficos, **SheetJS** no Excel, **jsPDF** no PDF

---

## Índice

1. [Como colocar no ar](#1-como-colocar-no-ar)
2. [O que já vem cadastrado](#2-o-que-já-vem-cadastrado)
3. [Como o casal compartilha a lista](#3-como-o-casal-compartilha-a-lista)
4. [As contas: como cada número é calculado](#4-as-contas-como-cada-número-é-calculado)
5. [Páginas do sistema](#5-páginas-do-sistema)
6. [Banco de dados](#6-banco-de-dados)
7. [Segurança](#7-segurança)
8. [Relatórios e exportações](#8-relatórios-e-exportações)
9. [Testes](#9-testes)
10. [Instalar no computador e no celular](#10-instalar-no-computador-e-no-celular)
11. [Publicar na web](#11-publicar-na-web)
12. [Estrutura do projeto](#12-estrutura-do-projeto)
13. [Identidade visual](#13-identidade-visual)
14. [Observações sobre o briefing](#14-observações-sobre-o-briefing)

---

## 1. Como colocar no ar

Pré-requisito: **Node.js 20 ou superior**.

### 1.1 Crie o projeto no Supabase

1. Entre em [supabase.com/dashboard](https://supabase.com/dashboard) e clique em
   **New project**.
2. Escolha a região mais próxima (para o Brasil, `South America (São Paulo)`) e
   guarde a senha do banco.

### 1.2 Prepare o banco

Há dois caminhos.

**Automático** — se você tem um token de acesso do Supabase com escopo na sua
organização ([como gerar](#quando-o-token-não-funciona)):

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...          # PowerShell: $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
npm run supabase:diagnosticar                 # confere o que o token alcança
npm run supabase:criar                        # cria o projeto, migra, verifica e grava o .env
```

O script cria o projeto, roda as cinco migrações na ordem, faz doze
verificações no banco e grava o `.env` sozinho. Se você já tem um projeto:
`node scripts/supabase-provision.mjs --projeto <ref>`.

**Manual** — no painel do projeto, abra **SQL Editor → New query**, cole
**todo** o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e execute.

Esse arquivo é a concatenação, na ordem correta, de:

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/0001_schema.sql` | Tabelas, chaves, índices e colunas calculadas |
| `supabase/migrations/0002_functions.sql` | Triggers financeiros e as funções (RPC) do app |
| `supabase/migrations/0003_rls.sql` | Row Level Security, permissões por coluna e Realtime |
| `supabase/migrations/0004_catalog_seed.sql` | A lista inicial do enxoval (14 categorias, 208 linhas) |

Rodar o `schema.sql` mais de uma vez é seguro: tudo usa `if not exists`,
`create or replace` e `on conflict`.

### Quando o token não funciona

O Supabase separa duas coisas de nomes parecidos, e é fácil tropeçar:

| | O que controla |
|---|---|
| **Permissões** ("acesso completo") | *o que* o token pode fazer |
| **Escopo** | *onde* ele pode fazer |

Um token com acesso completo **dentro do escopo de um projeto** não cria
projetos novos — criar projeto é ação de organização. O sintoma é um
`403 Forbidden` seco em `POST /v1/projects`, e `GET /v1/profile` responde
"This endpoint requires a user-scoped access token".

`npm run supabase:diagnosticar` diz em segundos que tipo de token é, o que ele
alcança e se consegue criar projetos — testando contra a sua organização real,
sem criar nada.

Para o caminho automático, gere o token com escopo na **organização** (ou na
conta inteira) em <https://supabase.com/dashboard/account/tokens>.

### 1.3 Copie as chaves

Em **Project Settings → API**, copie:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** → `VITE_SUPABASE_ANON_KEY`

> A chave `anon` é pública por natureza e pode ir para o front-end: quem protege
> os dados é o Row Level Security. **Nunca** use a chave `service_role` aqui.

### 1.4 Configure e rode

```bash
cp .env.example .env     # no Windows: copy .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

npm install
npm run dev
```

Abra <http://localhost:5173>. Sem as variáveis preenchidas, o sistema mostra uma
tela de configuração explicando o que falta — não quebra.

### 1.5 Primeiro acesso

1. Abra o aplicativo. Não há tela nenhuma antes do painel: a sessão é aberta
   sozinha e o espaço nasce já com as 14 categorias e as 208 linhas do enxoval.
2. Em **Configurações → Você**, diga **como podemos te chamar** — é o nome que
   aparece ao lado de cada compra. Até lá, você consta como *Participante*.
3. Ainda em **Configurações**, gere o **código de recuperação** e anote. Sem
   ele, limpar os dados do navegador significa perder o acesso.
4. Gere também um **código de pareamento** e digite-o no outro aparelho, em
   **Configurações → Entrar em outro espaço**.
5. Em **Financeiro**, defina o orçamento total. Até isso acontecer, saldo e
   alertas ficam em branco: nada é estimado por conta própria.

### 1.6 Ajustes de autenticação no Supabase

O sistema usa **sessões anônimas**. No painel do projeto:

| Onde | O quê |
|---|---|
| **Authentication → Sign In / Providers → Anonymous sign-ins** | precisa estar **ligado** |
| **Authentication → Sign In / Providers → Email** | pode ficar **desligado** — não há cadastro por e-mail |

O script `npm run supabase:criar` não mexe nisso; são dois cliques no painel.
Se a sessão anônima estiver desligada, o aplicativo diz exatamente isso na
abertura, em vez de falhar em silêncio.

---

## 2. O que já vem cadastrado

Ao criar o espaço, a RPC `create_space` copia o catálogo de referência para o
casal. São **14 categorias** e **208 linhas**: **202 produtos** e **6 tarefas de
verificação**.

| | Categoria | Linhas |
|---|---|---:|
| A | Quarto do casal | 18 |
| B | Banheiro | 15 |
| C | Cozinha — panelas e utensílios | 31 |
| D | Cozinha — pratos, copos e organização | 23 |
| E | Eletrodomésticos | 12 |
| F | Lavanderia e limpeza | 22 |
| G | Produtos de limpeza | 10 |
| H | Sala de estar | 11 |
| I | Sala de jantar e receber visitas | 11 |
| J | Organização geral | 10 |
| K | Ferramentas e manutenção | 15 |
| L | Segurança da casa (tarefas) | 6 |
| M | Higiene pessoal | 9 |
| N | Primeira compra de supermercado | 15 |

Como cada item nasce:

- **Preço estimado R$ 0,00** — para o casal preencher conforme pesquisar. Nenhum
  preço de mercado foi inventado.
- **Status pendente**, quantidade comprada zero. Nenhuma compra fictícia.
- **Quantidades e prioridades são sugestões editáveis**, não obrigações.
- **Itens condicionais** (coifa, suporte de papel higiênico, detector de fumaça,
  sapateira, prateleiras…) vêm com a observação de que dependem da estrutura da
  residência.
- **Tarefas de verificação** (categoria L) são marcadas com `is_task` e ficam
  fora do orçamento, do valor estimado restante e das quantidades compradas.
  Se houver uma despesa real ligada a uma delas, basta registrar a compra
  apontando para a tarefa — aí o valor conta.
- **Unidade de controle** por item: `unidade`, `peça`, `par`, `jogo`,
  `conjunto`, `pacote`, `embalagem`, `lote` ou `tarefa`.
- **Quantidade fracionada** liberada só onde faz sentido — os 15 itens da
  primeira compra de supermercado, vendidos por peso ou volume. Nos outros, o
  banco recusa fração (`items_fraction_chk`).

A fonte de verdade da lista é [`supabase/catalog.mjs`](supabase/catalog.mjs).
Para alterá-la e regerar o SQL:

```bash
node scripts/gen-catalog-sql.mjs
```

Em **Configurações → Lista inicial do enxoval**, o botão *Restaurar itens
faltantes* recadastra apenas o que foi excluído, sem duplicar nada e sem mexer
em preços ou compras.

---

## 3. Como o casal compartilha a lista

Não existe tela de login porque não existe conta — nem tela de boas-vindas,
nem escolha a fazer. No primeiro uso, o aplicativo abre sozinho uma **sessão
anônima** do Supabase e cria o espaço: o aparelho passa a ter uma identidade de
verdade, com `auth.uid()` próprio, e a primeira coisa que aparece é o painel.

Daí em diante, tudo o que protegia os dados antes continua valendo — o Row
Level Security é escrito sobre `auth.uid()`, e ele não sabe (nem precisa saber)
se a identidade veio de um e-mail ou de uma sessão anônima.

```
Aparelho da Ana                                 Aparelho do Bruno
   │                                                   │
   ├─ abre o app → sessão + espaço + 208 itens         ├─ abre o app → idem, no espaço dele
   ├─ cai direto no painel                             │
   ├─ Configurações → gerar código  ──  ABCD-EFGH  ──► │
   │                                                   ├─ Configurações → Entrar em outro
   │                                                   │  espaço → digita o código
   │                                                   │  (o espaço vazio dele é descartado)
   └──────────── mesmo espaço, dados sincronizados ────┘
```

### Os dois tipos de código

|  | Pareamento | Recuperação |
|---|---|---|
| Para que serve | ligar o aparelho da outra pessoa | voltar quando se perde o acesso |
| Tamanho | 8 caracteres (`ABCD-EFGH`) | 12 (`ABCD-EFGH-JKMN`) |
| Validade | 24 horas | sem prazo |
| Usos | um só | ilimitados |
| Quantos por espaço | quantos quiser | **um** — gerar outro invalida o anterior |

O alfabeto não tem **I, L, O, zero nem um**, então não há dúvida ao ditar por
telefone ou copiar à mão. O campo aceita colar com ou sem hífen, com espaços e
em minúsculas.

### O que isso custa

Vale saber antes de confiar os dados ao sistema:

- **O acesso mora no aparelho.** Limpar os dados do site, usar janela anônima
  ou trocar de celular derruba a sessão. O código de recuperação é a volta —
  por isso o aplicativo insiste para vocês anotarem.
- **Quem tem o código de recuperação, entra.** É a chave de casa: não mande em
  grupo nem deixe em print. Se vazar, gere outro — o anterior para de
  funcionar na hora.
- **Ninguém mais alcança nada.** Códigos só são legíveis por quem já está no
  espaço, e quem está entrando não lê nada: digita o código e a função
  `join_with_code` (que roda com privilégio próprio) resolve. Não dá para
  listar códigos à procura de um válido.

### O que os dois podem fazer

Ver os mesmos itens, registrar compras, atualizar quantidades, editar preços,
consultar o orçamento, acompanhar o histórico e ver quem fez cada compra.

**Sincronização.** O app assina o Realtime do Supabase para as tabelas do
espaço. Quando uma pessoa salva algo, a tela da outra recarrega em menos de um
segundo. Também há recarga ao voltar para a aba e um botão de atualizar manual
no cabeçalho.

**Duplicação de registro.** Cada compra carrega um `client_token` único, com
restrição `unique (space_id, client_token)`. Se as duas pessoas salvarem a mesma
compra ao mesmo tempo — ou se a conexão cair e o envio for repetido — o banco
recusa a segunda gravação em vez de dobrar o valor.

---

## 4. As contas: como cada número é calculado

Esta é a parte que precisa ser confiável, então vale ler com atenção.

### 4.1 O valor de uma compra

```
total_paid  =  quantidade × preço unitário  −  desconto  +  frete
```

O formulário calcula isso e preenche o campo **Total pago**, mas a pessoa pode
sobrescrever com o valor da nota — e, quando sobrescreve, o sistema mostra
quanto daria a conta e oferece voltar ao calculado.

**O `total_paid` é o valor definitivo.** Desconto e frete já estão refletidos
nele, então nunca são somados de novo em nenhum indicador. Essa regra é o que
evita o erro clássico de contar o frete duas vezes.

### 4.2 Pago, contratado e comprometido

Uma compra parcelada não é um gasto único. O sistema separa três números:

| Número | O que é | De onde vem |
|---|---|---|
| **Valor contratado** | o valor integral da compra, pago ou não | `purchases.total_paid` |
| **Já desembolsado** | o que efetivamente saiu do bolso | soma das parcelas pagas |
| **Comprometido** | o que ainda será pago | soma das parcelas em aberto |

Ao salvar uma compra, um trigger gera as parcelas, dividindo o total em partes
iguais — **a última absorve o arredondamento**, para a soma fechar exatamente no
total (3 × R$ 33,33 + R$ 33,34 = R$ 100,00). As `installments_paid` primeiras
parcelas contam como pagas; cada parcela paga gera uma linha em `payments`, que
é o livro-caixa do casal.

Para registrar que mais uma parcela foi quitada, edite a compra e aumente o
campo **Parcelas já pagas**.

### 4.3 Os indicadores

| Indicador | Fórmula |
|---|---|
| **Total efetivamente gasto** | `soma(payments) + soma(despesas adicionais)` |
| **Valor total contratado** | `soma(purchases.total_paid) + despesas adicionais` |
| **Comprometido em parcelas** | `soma(parcelas em aberto)` |
| **Saldo do orçamento** | `orçamento total − total gasto` |
| **Valor estimado restante** | `soma(preço estimado × quantidade pendente)` |
| **Economia por item** | `quantidade comprada × preço estimado − valor pago` |
| **Projeção ao concluir** | `orçamento − total gasto − estimado restante` |
| **Percentual de conclusão** | `unidades adquiridas ÷ unidades planejadas`, só entre itens ativos |

"Itens ativos" exclui tarefas de verificação e itens marcados como *não será
comprado*. As unidades adquiridas são limitadas ao planejado, então comprar 8
pratos de 6 necessários dá 100%, não 133%.

Enquanto o orçamento total não é definido, **saldo, uso do orçamento e projeção
ficam em branco** (`null`), não em zero — a diferença entre "não sei" e "é zero"
importa.

### 4.4 Compras parciais e sucessivas

O exemplo do briefing, resolvido pelo sistema:

> Precisam de 6 pratos. Compram 4 por R$ 80,00. Depois, os 2 restantes por
> R$ 45,00.

| | |
|---|---|
| Quantidade necessária | 6 |
| Quantidade comprada | 6 |
| Quantidade pendente | 0 |
| Total gasto | R$ 125,00 |
| Preço médio por unidade | R$ 20,83 |
| Status | Comprado |

Depois da primeira compra, o item ficaria em *parcialmente comprado*, com 2
compradas, 4 pendentes e R$ 100,00 de estimado restante (a 4 × R$ 25,00). O
histórico das duas compras fica preservado e editável.

### 4.5 "Não será comprado"

Marcar um item assim o tira das quantidades pendentes, do valor estimado
restante e do denominador da conclusão — **sem apagar o histórico de compras já
feitas**. O que já foi gasto continua no total gasto, porque aquele dinheiro
realmente saiu.

### 4.6 Alertas de orçamento

Orçamento por categoria dispara aviso em **80%** (atenção) e **100%**
(estourado). Os alertas aparecem no painel e no financeiro, sempre com ícone e
texto — nunca só com cor.

### 4.7 Onde esses cálculos moram

| Camada | Responsabilidade |
|---|---|
| **Banco** (colunas geradas) | `qty_pending`, `estimated_total`, `estimated_remaining`, `savings`, `avg_unit_paid`, `status` — nunca divergem, porque são calculadas na própria linha |
| **Banco** (triggers) | `qty_bought`, `total_spent`, `paid_amount`, `last_purchase_at`, as parcelas e os pagamentos |
| **Front-end** (`src/lib/calc.ts`) | Os agregados do painel, dos recortes por categoria e por mês — funções puras, cobertas por testes |

O cliente **não tem permissão de escrita** nos campos agregados. Isso é
garantido por `GRANT` por coluna, não só pela interface — ver
[Segurança](#7-segurança).

---

## 5. Páginas do sistema

| Página | Rota | O que faz |
|---|---|---|
| **Painel** | `/` | 12 indicadores, conclusão do enxoval, composição por status, gráficos de categoria e mês, orçamento × gasto real, últimas compras, próximos prioritários e alertas |
| **Checklist** | `/checklist` | Os 208 registros com busca, filtros (categoria, prioridade, status), ordenação, visão em lista ou cards, ocultar concluídos, apenas pendentes, barra de progresso por item, adicionar/editar/duplicar/excluir e marcação rápida |
| **Compras** | `/compras` | Histórico completo com filtros por data, categoria, loja e responsável; edição e exclusão com recálculo automático; exportação em CSV |
| **Itens pendentes** | `/pendentes` | O que falta, agrupado por prioridade, com seleção para gerar a lista de compras da próxima ida à loja |
| **Financeiro** | `/financeiro` | Orçamento total, por categoria e meta mensal; parcelas a vencer; despesas adicionais (frete, montagem, instalação, taxas) |
| **Relatórios** | `/relatorios` | As sete exportações e o comparativo estimado × realizado |
| **Configurações** | `/configuracoes` | Nome e subtítulo do espaço, orçamento, categorias, quem tem acesso, códigos de pareamento e recuperação, restauração da lista inicial, seu nome e histórico de alterações |

Nenhum botão principal é decorativo: cada um executa a ação que anuncia.

### O checkbox do checklist

Marcar o checkbox de um produto **não** o resolve sozinho — abre o formulário de
compra para registrar quantidade e valor pago, como pede o briefing. Em tarefas
de verificação, o checkbox marca a tarefa como feita diretamente (tarefa não tem
valor).

---

## 6. Banco de dados

```
auth.users ─┬─ profiles
            │
            └─ space_members ──── spaces ──┬── categories ──┬── items ──┬── purchases ──┬── installments ── payments
                                            │                │           │               │
                                            ├── budgets ──────┘           │               └── (parcelas e pagamentos
                                            ├── extra_expenses            │                    são derivados)
                                            ├── space_codes               │
                                            └── activity_log              └── (qty_bought, total_spent e
                                                                               paid_amount vêm das compras)

catalog_categories ── catalog_items     (catálogo de referência, só leitura)
```

| Tabela | Papel |
|---|---|
| `profiles` | Nome e e-mail visíveis para quem divide o espaço |
| `spaces` | O espaço do casal: nome, subtítulo, meta mensal |
| `space_members` | Participantes e papel (`dono` / `membro`) |
| `space_codes` | Códigos de pareamento e de recuperação |
| `categories` | As 14 categorias do enxoval (editáveis) |
| `items` | Os itens, com 6 colunas calculadas pelo próprio banco |
| `purchases` | Cada compra registrada |
| `installments` | Parcelas — **gerada por trigger**, somente leitura |
| `payments` | Parcelas pagas — **gerada por trigger**, é o livro-caixa |
| `budgets` | Orçamento total, por categoria e meta mensal |
| `extra_expenses` | Frete avulso, montagem, instalação, taxas |
| `activity_log` | Histórico de alterações, alimentado por triggers |
| `catalog_*` | A lista inicial de referência |

### Funções disponíveis (RPC)

| Função | Para que serve |
|---|---|
| `create_space(nome)` | Cria o espaço, o vínculo de dono e cadastra as 208 linhas |
| `seed_space_catalog(espaço)` | Recadastra apenas o que falta da lista inicial |
| `create_access_code(espaço, tipo)` | Gera o código de pareamento ou de recuperação |
| `join_with_code(código)` | Entra no espaço com um código |
| `set_budget(espaço, tipo, valor, categoria, mês)` | Define orçamento total, por categoria ou meta mensal |
| `leave_space(espaço)` | Sai do espaço (o último dono precisa transferir antes) |

### Garantias de consistência

- Chaves estrangeiras em tudo, com `on delete` escolhido caso a caso: excluir um
  item **não** apaga as compras (`set null`); excluir uma categoria com itens é
  recusado (`restrict`).
- `CHECK` em valores monetários (`>= 0`), quantidades (`> 0`), número de parcelas
  (1 a 60) e `installments_paid <= installments`.
- `unique (space_id, client_token)` em compras, contra duplicação.
- Índices parciais únicos nos orçamentos: um total por espaço, um por categoria,
  um por mês.
- Trigger `assert_category_in_space` impede apontar para a categoria de outro
  espaço — o RLS garante que a linha é sua, mas não que a chave estrangeira
  também seja.
- Trigger `purchases_before_write` valida que o item pertence ao espaço e que a
  quantidade fracionada é permitida para aquele item.

### O que acontece ao excluir

Vale saber, porque é onde bancos costumam travar:

| Você exclui | O que acontece |
|---|---|
| Uma compra | Parcelas e pagamentos vão junto; o item volta ao estado anterior |
| Um item | As compras ficam no histórico, sem vínculo com ele |
| Uma categoria com itens | Recusado — mova ou exclua os itens antes |
| Um espaço | Leva tudo junto, inclusive o histórico |
| Uma conta | Os registros ficam; perde-se apenas o crédito de autoria |

A exclusão de espaço **não funcionava** na primeira versão do esquema. A
política `spaces_delete` prometia a exclusão ao dono, mas o gatilho de
histórico tentava gravar uma linha apontando para o espaço que estava sendo
apagado, e a chave estrangeira recusava. Quem encontrou foi o teste de
integração, na primeira execução contra o banco real — nenhum teste de unidade
pegaria isso. A correção está em `log_change`, no 0002.

A sintaxe de todos os arquivos SQL foi validada com o analisador oficial do
PostgreSQL (`libpg_query`). E o esquema inteiro foi executado num projeto
Supabase de verdade, com as 12 verificações do provisionador passando.

---

## 7. Segurança

**Isolamento por espaço.** Row Level Security em todas as tabelas, com a política
`is_space_member(space_id)`. Um casal não alcança os dados de outro, nem pela
API direta, nem pelo Realtime. As funções auxiliares são `SECURITY DEFINER` para
consultar `space_members` sem recursão de política.

**Blindagem dos agregados financeiros.** Além do RLS, usamos `GRANT` por coluna:

```sql
grant update (
  category_id, name, subcategory, unit, qty_needed, unit_price_estimate,
  priority, excluded, task_done, allow_fraction, qty_open, conditional,
  notes, product_url, updated_at
) on public.items to authenticated;
```

`qty_bought`, `total_spent` e `paid_amount` **não estão na lista**. Nem com a
chave anon na mão alguém altera um total gasto por fora das compras — só os
triggers escrevem ali. `installments`, `payments` e `activity_log` são somente
leitura para o cliente.

**Códigos.** O de pareamento vale 24 horas e só pode ser usado uma vez; o de
recuperação é único por espaço e some assim que outro é gerado. Nenhum dos dois
é legível por quem está de fora: a entrada passa pela função `join_with_code`,
que roda com privilégio próprio e nunca expõe a lista. Ambos podem ser
revogados a qualquer momento.

**Sessões anônimas.** Qualquer pessoa pode abrir uma — é o que dispensa o
cadastro. Mas uma sessão nova não enxerga espaço nenhum: sem um código válido,
ela fica num aplicativo vazio.

**Rastreabilidade.** Toda criação, atualização e exclusão de itens, compras,
orçamentos e despesas vai para `activity_log` com autor e horário, visível em
Configurações.

---

## 8. Relatórios e exportações

| Relatório | Formato | Conteúdo |
|---|---|---|
| Checklist completo | Excel | Todos os itens com quantidades, preços, totais, status e observações + aba de resumo |
| Itens pendentes | Excel | O que falta, por prioridade, com o estimado restante + aba de tarefas |
| Histórico de compras | CSV | Uma linha por compra, com desconto, frete, pago e a vencer |
| Relatório financeiro | PDF | Indicadores, orçamento por categoria, evolução mensal, compras e despesas |
| Gastos por categoria | Excel | Orçamento, gasto, uso, comprometido e falta estimado + aba por mês |
| Estimado × realizado | Excel | Comparativo item a item |
| Lista de compras | Excel | Lista enxuta para levar à loja (dos itens selecionados em Pendentes) |

Os CSV saem com BOM UTF-8 e ponto e vírgula, então abrem direto no Excel em
português, com acentos corretos. Todos os valores no padrão `R$ 1.234,56`.

As bibliotecas de Excel e PDF somam cerca de 680 kB e por isso carregam **só no
clique** — a abertura do sistema não paga por elas.

---

## 9. Testes

```bash
npm run verify           # tipos + 88 testes + build, de uma vez
npm test                 # só os testes
npm run test:watch
npm run desktop:verify   # abre o app de computador, confere e encerra
npm run supabase:teste   # 79 verificações contra o banco real
```

**`src/lib/calc.test.ts` — 50 testes do núcleo financeiro.** As fábricas de
teste reproduzem as colunas geradas e os triggers do Postgres, então os testes
exercitam a mesma forma de dado que a aplicação recebe do banco. Cobrem:

- formatação e leitura de números no padrão brasileiro (`R$ 1.234,56`, `1.234,56`,
  `R$ 80`, `80.5`);
- o exemplo dos 6 pratos, incluindo o preço médio de R$ 20,83;
- compra parcial, compras sucessivas e compra acima do planejado;
- os quatro estados do item e o status das tarefas;
- itens excluídos e tarefas fora do orçamento e das quantidades;
- despesa real lançada contra uma tarefa (conta no gasto, não na conclusão);
- total da compra com desconto e frete, sem contagem dupla;
- parcelamento: pago × a vencer, arredondamento que fecha no total, distribuição
  por mês de vencimento;
- orçamento indefinido, saldo, projeção positiva e negativa;
- alertas em 80% e 100% por categoria;
- economia por item e itens acima do estimado;
- busca sem acento, filtros, ordenação e próximos prioritários;
- agregados por categoria.

**`src/components/render.test.tsx` — 26 testes de renderização.** Montam as
figuras do painel com dados reais e cobrem os casos que mais quebram interface:
tudo zerado, orçamento estourado, valor acima de 100%, `NaN`. Também verificam
acessibilidade: `role="progressbar"` com `aria-valuenow`, legendas presentes
para que identidade nunca dependa só de cor, campos ligados a rótulo e erro, e
`aria-invalid` em campo inválido.

**`src/components/layout/AppStatus.test.tsx` — 12 testes do aplicativo
instalável.** Aviso de conexão aparecendo e sumindo com os eventos do
navegador, convite de instalação respeitando quem já dispensou ou já instalou,
caminho manual do Safari no iPhone e a detecção de sistema usada nos textos.

**`npm run desktop:verify` — verificação do aplicativo de computador.** Abre a
janela do Electron de verdade, espera a interface assentar e confere três
coisas antes de encerrar: a interface montou, a origem é `app://local` (e não
`file://`) e a ponte do `preload` está ativa. Roda em CI com `xvfb`.

**`npm run supabase:teste` — 79 verificações contra o banco real.** Este é o
teste que fecha o circuito. Ele abre sessões anônimas de verdade (Ana e Bruno,
um casal; mais um intruso), monta os espaços e exercita o banco de ponta a
ponta:

| | O que prova |
|---|---|
| 1 | Criar um espaço cadastra as 208 linhas, com preço R$ 0,00 e tudo pendente |
| 2–3 | O caso dos 6 pratos: compra parcial, depois a segunda, consolidando em R$ 125,00 e média de R$ 20,83 |
| 4 | Parcelamento em 10×: as parcelas somam exato, 3 pagas viram R$ 1.080,00 no livro-caixa e R$ 2.520,00 comprometidos |
| 5 | Excluir uma compra devolve o item ao estado anterior e leva as parcelas junto |
| 6 | "Não será comprado" tira das pendências e mantém o histórico |
| 7 | O código de pareamento é de uso único, aceita texto torto e liga o segundo aparelho |
| 7b | O de recuperação traz de volta um aparelho novo, e gerar outro invalida o anterior |
| 8 | Orçamento e saldo batem; redefinir atualiza em vez de duplicar |
| 9 | **Um casal não enxerga nada do outro** — leitura, escrita e edição, em 8 tabelas |
| 10 | O cliente não consegue escrever `total_spent`, `qty_bought` nem `paid_amount` |

Tudo que o teste cria é apagado no fim — inclusive se um passo falhar — e a
última verificação confirma que não sobrou resíduo no banco.

### O que os testes não cobrem

O fluxo pela interface (dois navegadores abertos, uma pessoa registrando uma
compra e a outra vendo aparecer) foi exercitado em nível de unidade, de
componente e de API, mas não com dois navegadores reais ao mesmo tempo.

No empacotamento, o que foi verificado de fato nesta máquina foi o **Windows**:
o instalador e a versão portátil foram gerados e abertos, com a janela subindo
e a interface montando. Os pacotes de **macOS e Linux** não foram gerados aqui —
cada sistema só pode ser empacotado na sua própria plataforma. É exatamente para
isso que existe `.github/workflows/desktop.yml`, que os constrói nos três
sistemas de uma vez.

---

## 10. Instalar no computador e no celular

O mesmo sistema vira aplicativo de duas maneiras. Nas duas, os dados continuam
no Supabase do casal — instalar não cria uma cópia separada.

### 10.1 Instalar pelo navegador (PWA)

É o caminho mais simples e cobre **todos os sistemas**, inclusive celular.
Funciona assim que o endereço estiver publicado com HTTPS.

| Sistema | Como instalar |
|---|---|
| **Windows / macOS / Linux** (Chrome, Edge, Brave) | Ícone de instalar na barra de endereço, ou menu ⋮ → *Instalar Nosso Lar* |
| **Android** (Chrome) | Menu ⋮ → *Instalar aplicativo* |
| **iPhone / iPad** (Safari) | Compartilhar → *Adicionar à Tela de Início* |
| **macOS** (Safari) | Arquivo → *Adicionar ao Dock* |

O próprio sistema oferece a instalação no momento certo; no iPhone, onde o
Safari não tem esse convite automático, aparece a instrução do caminho manual.

Depois de instalado, o Nosso Lar ganha ícone próprio, abre em janela sem barra
de endereço e traz atalhos para **Checklist**, **Compras** e **Financeiro** no
menu de contexto do ícone.

**Sobre funcionar offline.** A casca do aplicativo — telas, estilos, fontes,
ícones — fica guardada, então ele abre sem internet e mostra o que já tinha sido
carregado. Os dados em si vivem no Supabase: sem rede, uma faixa avisa que
**novos registros só serão salvos quando a conexão voltar**. Nenhuma chamada ao
banco passa pelo cache, justamente para nunca mostrar saldo velho como se fosse
atual.

**Atualizações** nunca acontecem sozinhas. Quando sai uma versão nova, aparece
um aviso com o botão *Atualizar agora* — trocar a página no meio do cadastro de
uma compra perderia o que estava sendo digitado.

### 10.2 Aplicativo de computador (Electron)

Para quem prefere um programa instalado de verdade, com ícone na barra de
tarefas e menu nativo em português.

```bash
npm run desktop:dev        # desenvolvimento, com recarga automática
npm run desktop:start      # roda o build de produção
npm run desktop:verify     # abre, confere que a interface montou e encerra
npm run desktop:dist       # gera os instaladores do seu sistema
```

Os arquivos saem em `release/`:

| Sistema | Arquivos | Comando |
|---|---|---|
| **Windows** | `...instalador.exe` e `...portatil.exe` | `npm run desktop:dist:win` |
| **macOS** | `....dmg` e `....zip` (Intel e Apple Silicon no mesmo arquivo) | `npm run desktop:dist:mac` |
| **Linux** | `....AppImage`, `....deb` e `....rpm` | `npm run desktop:dist:linux` |

**Cada sistema precisa ser empacotado na sua própria plataforma.** Não dá para
gerar o `.dmg` a partir do Windows. Para resolver isso de uma vez, use a
automação em [`.github/workflows/desktop.yml`](.github/workflows/desktop.yml):
publique uma tag (`git tag v1.0.0 && git push --tags`) e ela empacota os três
sistemas em paralelo e abre um rascunho de versão com tudo anexado. Antes do
primeiro uso, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em
*Settings → Secrets and variables → Actions*.

#### O que torna o app de computador seguro

- `contextIsolation` e `sandbox` ligados, `nodeIntegration` desligado: a página
  não alcança o Node nem o sistema de arquivos.
- Os arquivos são servidos por um protocolo próprio (`app://`) em vez de
  `file://`. Isso dá uma origem de verdade — `localStorage` persiste, o
  roteamento por caminho funciona e o Supabase aceita as requisições. O
  manipulador recusa qualquer caminho que tente sair da pasta do aplicativo.
- Content-Security-Policy restritiva, com conexão liberada **apenas** para o
  Supabase.
- Links externos e `window.open` abrem no navegador padrão, nunca dentro da
  janela do aplicativo.
- Nenhuma permissão de navegador (câmera, local, notificações) é concedida.

#### Pacotes sem assinatura digital

Os instaladores saem sem certificado, porque assinar exige um certificado pago
(Windows) ou uma conta de desenvolvedor Apple. Na primeira abertura:

- **Windows:** o SmartScreen mostra "Windows protegeu o computador" →
  *Mais informações* → *Executar assim mesmo*.
- **macOS:** clique com o botão direito no aplicativo → *Abrir* → *Abrir*. Ou
  *Ajustes do Sistema → Privacidade e Segurança → Abrir Assim Mesmo*.
- **Linux:** o `.AppImage` precisa de permissão de execução:
  `chmod +x "Nosso Lar-1.0.0-x64.AppImage"`.

Para assinar de verdade, cadastre os segredos `CSC_LINK`/`CSC_KEY_PASSWORD`
(Windows) ou `CSC_LINK`/`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD` (macOS) e
remova `CSC_IDENTITY_AUTO_DISCOVERY: false` do workflow.

#### Dois tropeços conhecidos no Windows

**1. A janela não abre e aparece "Cannot read properties of undefined".**
Terminais embutidos em editores (o do VS Code, por exemplo) deixam
`ELECTRON_RUN_AS_NODE=1` no ambiente, e com isso o Electron roda como se fosse
o Node puro. Os comandos `desktop:*` passam por
[`scripts/desktop.mjs`](scripts/desktop.mjs), que remove essa variável antes de
iniciar — então use sempre os comandos do `npm`, não `npx electron .`
diretamente.

**2. `npm run desktop:dist` falha com "Cannot create symbolic link".**
O empacotador baixa um conjunto de ferramentas de assinatura que contém
atalhos simbólicos de macOS, e o Windows só permite criá-los com Modo
Desenvolvedor ligado. Três saídas:

- ligue o **Modo Desenvolvedor** em *Configurações → Sistema → Para
  desenvolvedores*; ou
- rode o terminal como administrador; ou
- deixe a automação do GitHub Actions empacotar.

A pasta `release/win-unpacked` é gerada mesmo quando o instalador falha, e o
`Nosso Lar.exe` lá dentro já funciona.

### 10.3 Ícones

Todos os ícones — favicon, PWA, `.ico` do Windows, `.icns` do macOS — saem de
uma única fonte vetorial:

```bash
npm run gen:icons
```

O script usa um rasterizador WebAssembly, sem compilador nativo, então roda
igual em Windows, macOS e Linux. Os contêineres `.ico` e `.icns` são montados
em código, sem depender de ferramenta específica de cada sistema.

---

## 11. Publicar na web

O build é um site estático; qualquer hospedagem serve.

```bash
npm run build    # gera dist/
npm run preview  # confere o build localmente
```

**Vercel ou Netlify:** conecte o repositório, comando `npm run build`, pasta
`dist`, e cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis
de ambiente.

Como é uma SPA com rotas, configure o redirecionamento para `index.html`:

```jsonc
// vercel.json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

```
# netlify.toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Não há nada para configurar no Supabase depois de publicar: como não existe
login por e-mail, nenhum link de confirmação precisa voltar para a aplicação.

> **HTTPS é obrigatório** para a instalação pelo navegador funcionar. Vercel,
> Netlify, Cloudflare Pages e GitHub Pages já entregam HTTPS por padrão.

### No celular

A interface é responsiva: barra lateral no computador, gaveta e navegação
inferior no celular, tabelas com rolagem horizontal própria, alvos de toque
confortáveis e respeito a `prefers-reduced-motion`. Dá para usar no navegador
ou instalar na tela de início — veja a [seção 10](#10-instalar-no-computador-e-no-celular).

---

## 12. Estrutura do projeto

```
├── index.html
├── electron-builder.yml         # alvos de Windows, macOS e Linux
├── electron/
│   ├── main.cjs                 # janela, protocolo app://, CSP e menu
│   └── preload.cjs              # ponte mínima entre o menu e a interface
├── build/                       # ícones do empacotador (gerados)
│   ├── icon.png · icon.ico · icon.icns
│   └── entitlements.mac.plist
├── .github/workflows/
│   ├── ci.yml                   # tipos, testes, build e app de computador
│   └── desktop.yml              # instaladores dos três sistemas + release
├── supabase/
│   ├── catalog.mjs              # fonte de verdade da lista do enxoval
│   ├── schema.sql               # gerado: cole no SQL Editor
│   └── migrations/              # 0001 esquema · 0002 funções · 0003 RLS · 0004 catálogo
├── scripts/
│   ├── gen-catalog-sql.mjs      # catalog.mjs -> 0004 + schema.sql
│   ├── gen-icons.mjs            # uma fonte vetorial -> todos os ícones
│   └── desktop.mjs              # lançador do Electron à prova de ambiente
├── public/
│   ├── icons/                   # ícones do PWA, incluindo os "maskable"
│   └── favicon.ico · favicon.svg · apple-touch-icon.png
└── src/
    ├── App.tsx                  # rotas, barreira de erro, carga sob demanda
    ├── lib/
    │   ├── calc.ts              # ⭐ todo o cálculo financeiro (funções puras)
    │   ├── calc.test.ts
    │   ├── format.ts            # R$ 1.234,56, datas, leitura de números
    │   ├── exports.ts           # Excel, CSV e PDF
    │   ├── export-actions.ts    # carrega as bibliotecas pesadas só no clique
    │   ├── runtime.ts           # navegador, PWA instalado ou app de computador
    │   ├── supabase.ts          # cliente e tradução de erros
    │   └── viz.ts               # paleta de gráficos validada
    ├── contexts/
    │   ├── SessionContext.tsx   # sessão anônima, aberta sozinha; sem login
    │   ├── SpaceContext.tsx     # dados do espaço, Realtime e mutações
    │   └── ToastContext.tsx
    ├── components/
    │   ├── ui/                  # botões, campos, modal, avisos, campo de código
    │   ├── layout/
    │   │   ├── AppShell.tsx     # navegação e atalhos do menu nativo
    │   │   └── AppStatus.tsx    # conexão, atualização e convite de instalação
    │   ├── dashboard/           # figuras e gráficos
    │   ├── checklist/           # formulário e detalhe do item
    │   └── purchases/           # formulário de compra
    └── pages/                   # as 7 páginas + a tela de configuração
```

O arquivo para ler primeiro é [`src/lib/calc.ts`](src/lib/calc.ts): ele define,
em um lugar só e com comentários, o que cada número significa.

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Desenvolvimento no navegador |
| `npm run build` | Verifica tipos e gera `dist/` |
| `npm run preview` | Serve o build para conferência |
| `npm run verify` | Tipos + testes + build, de uma vez |
| `npm test` | Os 88 testes |
| `npm run desktop:dev` | App de computador com recarga automática |
| `npm run desktop:start` | App de computador com o build de produção |
| `npm run desktop:verify` | Abre, confere e encerra (serve para CI) |
| `npm run desktop:dist` | Instaladores do sistema atual |
| `npm run desktop:dist:win` · `:mac` · `:linux` | Instaladores de um sistema específico |
| `npm run gen:icons` | Regera todos os ícones a partir do vetor |
| `npm run gen:catalog` | Regera o SQL da lista inicial |

---

## 13. Identidade visual

| Cor | Hex | Uso |
|---|---|---|
| Branco quente | `#F7F6F2` | Fundo dos cards — predomina |
| Bege / greige | `#D6D0C6` | Bordas, divisores, estados neutros |
| Madeira clara | `#C6A77D` | Detalhes, ícones de seção |
| Preto fosco | `#242424` | Texto e elementos pontuais |
| Verde-oliva | `#7D8467` | Progresso, conclusão e ações positivas |

Cards com cantos arredondados, sombras discretas, ícones minimalistas, tabelas
organizadas e animações sutis. Interface inteiramente em português brasileiro.

### O ícone do aplicativo

A marca é uma casa com telhado em madeira clara, paredes em preto fosco e um
visto em verde-oliva, sobre o branco quente. Ela sai de um único arquivo
vetorial em [`scripts/gen-icons.mjs`](scripts/gen-icons.mjs), em duas variantes:
a normal, com cantos arredondados, e a "maskable" do Android, com folga maior
para o sistema recortar no formato que quiser sem cortar o desenho.

### A paleta dos gráficos

A rampa dos gráficos é derivada do verde-oliva da marca em OKLCH, mantendo o
matiz e variando a luminosidade:

```
#EFF2E7  #DEE2D1  #C1C8AE  #9BA382  #78815C  #5C643F  #434A2A  #2B3117
  100      200      300      400      500      600      700      800
```

Validada contra a superfície `#F7F6F2`: luminosidade monótona, salto de ΔL ≥ 0,06
entre passos, ponta clara em 2,44:1 e matiz único (dispersão de 1°).

As 14 categorias do enxoval são nominais — não há ordem natural entre "Banheiro"
e "Cozinha" — e são muitas para codificar por cor. Por isso o gráfico de
despesas usa **um matiz só** para todas as barras (o comprimento já mostra a
magnitude) e dobra a cauda em "Outras categorias". A evolução mensal é uma série
única, então dispensa caixa de legenda; a meta mensal entra como linha de
referência, que é um limiar, não uma segunda série. Não há gráfico de dois eixos
nem gráfico de pizza.

As cores de status (`#0CA30C`, `#FAB219`, `#EC835A`, `#D03B3B`) são uma escala
fixa e reservada, sempre acompanhadas de ícone e texto. Texto nunca veste a cor
do dado: a identidade vem do ponto colorido ao lado.

Cada gráfico tem um gêmeo em tabela, acessível pelo botão no canto do card —
nenhum valor fica preso em tooltip.

---

## 14. Observações sobre o briefing

Duas coisas que vale registrar, para que não pareçam descuido:

**A contagem de itens.** O briefing menciona 193 itens, mas a lista da seção 12
tem **208 linhas** (202 produtos + 6 tarefas de verificação) quando cada linha é
contada como um item independente, conforme a própria instrução da seção 12.
Cadastrei todas as 208 linhas. Se a intenção era chegar a 193, a diferença são
15 linhas que o casal pode excluir em Configurações ou marcar como *não será
comprado*.

**As prioridades da tabela.** A seção 11 pede três prioridades — Essencial,
Importante e Opcional — mas a tabela da seção 12 usa também "Conforme
necessidade", "Conforme preferência" e "Conforme consumo". O mapeamento adotado:

| Na tabela | Prioridade | Observação adicionada |
|---|---|---|
| Essencial | Essencial | — |
| Importante | Importante | — |
| Opcional | Opcional | — |
| Conforme necessidade | Opcional + condicional | "Depende da estrutura da residência — confirme a necessidade antes de comprar." |
| Conforme preferência | Opcional | "Conforme a preferência do casal." |
| Conforme consumo | Importante | "Ajuste a quantidade conforme o consumo do casal." |

Tudo isso é editável item por item.

**Tema claro.** O briefing define uma identidade com o branco quente
predominando, então o sistema se compromete com o tema claro e pinta todas as
cores explicitamente, em vez de seguir a preferência do sistema operacional.

---

Feito com cuidado para que o casal confie nos números. Qualquer dúvida sobre uma
conta específica, o comentário no topo de
[`src/lib/calc.ts`](src/lib/calc.ts) explica a convenção, e o teste
correspondente em [`src/lib/calc.test.ts`](src/lib/calc.test.ts) mostra o caso
concreto.
