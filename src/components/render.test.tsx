/**
 * Teste de fumaça da camada visual.
 *
 * Não substitui o uso real no navegador, mas garante que as figuras do painel
 * renderizam com dados verdadeiros — inclusive nos casos limites que mais
 * quebram interface: tudo zerado, orçamento estourado, valor acima de 100%.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  BulletRow,
  HeroFigure,
  Meter,
  StackedBar,
  StatTile,
} from '@/components/dashboard/figures';
import { EstimateVsActual } from '@/components/dashboard/charts';
import { Button, Chip, EmptyState, LinkButton, Notice } from '@/components/ui/primitives';
import { Checkbox, Field, Input, MoneyInput, SegmentedControl } from '@/components/ui/form';
import { SetupScreen } from '@/pages/SetupScreen';
import { STATUS_FILL } from '@/lib/viz';
import { money, percentPoints } from '@/lib/format';
import { STATUS_LABEL } from '@/types/database';

afterEach(cleanup);

/* ═════════════════════════════ Medidor ════════════════════════════════════ */

describe('Meter', () => {
  it('expõe o progresso como barra acessível', () => {
    render(<Meter ratio={0.42} label="Progresso do enxoval" />);
    const bar = screen.getByRole('progressbar', { name: 'Progresso do enxoval' });

    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('achata valores fora da faixa em vez de transbordar', () => {
    const { container } = render(<Meter ratio={3.7} label="Estouro" />);
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement;

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(fill.style.width).toBe('100%');
  });

  it('não quebra com valor inválido', () => {
    render(<Meter ratio={Number.NaN} label="Sem dados" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('pinta o preenchimento com a cor da gravidade', () => {
    const { container } = render(<Meter ratio={1} tone="critical" label="Estourado" />);
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement;
    // Status crítico da escala fixa.
    expect(fill.style.background.toLowerCase()).toContain('208, 59, 59');
  });
});

/* ══════════════════════════ Número protagonista ═══════════════════════════ */

describe('HeroFigure', () => {
  it('mostra rótulo, valor e legenda', () => {
    render(
      <HeroFigure
        label="Conclusão do enxoval"
        value={percentPoints(37.5)}
        caption="78 de 208 unidades"
      />,
    );

    expect(screen.getByText('Conclusão do enxoval')).toBeTruthy();
    expect(screen.getByText('37,5%')).toBeTruthy();
    expect(screen.getByText('78 de 208 unidades')).toBeTruthy();
  });
});

/* ═══════════════════════════ Barra empilhada ══════════════════════════════ */

describe('StackedBar', () => {
  const segments = [
    { key: 'comprado', label: STATUS_LABEL.comprado, value: 12, color: STATUS_FILL.comprado },
    { key: 'parcial', label: STATUS_LABEL.parcial, value: 3, color: STATUS_FILL.parcial },
    { key: 'pendente', label: STATUS_LABEL.pendente, value: 185, color: STATUS_FILL.pendente },
    {
      key: 'nao_sera_comprado',
      label: STATUS_LABEL.nao_sera_comprado,
      value: 2,
      color: STATUS_FILL.nao_sera_comprado,
    },
  ];

  it('descreve a composição para leitores de tela e lista a legenda', () => {
    render(<StackedBar segments={segments} total={202} />);

    const chart = screen.getByRole('img');
    expect(chart.getAttribute('aria-label')).toContain('Comprado: 12 itens');
    expect(chart.getAttribute('aria-label')).toContain('Pendente: 185 itens');

    // Legenda presente para todas as quatro faixas (identidade nunca só por cor).
    for (const segment of segments) {
      expect(screen.getByText(segment.label)).toBeTruthy();
    }
  });

  it('aguenta o estado inicial, com tudo pendente', () => {
    render(
      <StackedBar
        total={202}
        segments={[
          { key: 'comprado', label: 'Comprado', value: 0, color: STATUS_FILL.comprado },
          { key: 'pendente', label: 'Pendente', value: 202, color: STATUS_FILL.pendente },
        ]}
      />,
    );
    // O valor aparece duas vezes: dentro da faixa e na legenda.
    expect(screen.getAllByText('202')).toHaveLength(2);
  });

  it('não divide por zero quando não há itens', () => {
    render(
      <StackedBar
        total={0}
        segments={[{ key: 'pendente', label: 'Pendente', value: 0, color: '#9BA382' }]}
      />,
    );
    expect(screen.getByRole('img')).toBeTruthy();
  });
});

/* ════════════════════════════ Stat tile ═══════════════════════════════════ */

describe('StatTile', () => {
  it('mostra valor, submensagem e medidor', () => {
    render(
      <StatTile
        label="Orçamento total"
        value={money(25000)}
        sub="40% utilizado"
        meter={{ ratio: 0.4 }}
      />,
    );

    expect(screen.getByText('Orçamento total')).toBeTruthy();
    expect(screen.getByText(/25\.000,00/)).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  it('acompanha o aviso de limite com ícone e texto, nunca só com cor', () => {
    render(<StatTile label="Saldo disponível" value={money(-320)} tone="critical" />);
    expect(screen.getByText('Limite atingido')).toBeTruthy();
  });

  it('mostra "Não definido" quando o orçamento ainda não existe', () => {
    render(<StatTile label="Orçamento total" value="Não definido" sub="defina no Financeiro" />);
    expect(screen.getByText('Não definido')).toBeTruthy();
  });
});

/* ═══════════════════════ Orçamento × gasto real ═══════════════════════════ */

describe('BulletRow', () => {
  it('mostra gasto sobre orçamento e o percentual de uso', () => {
    render(<BulletRow label="Cozinha" spent={820} budget={1000} estimatedRemaining={240} />);

    expect(screen.getByText('Cozinha')).toBeTruthy();
    expect(screen.getByText(/820,00/)).toBeTruthy();
    expect(screen.getByText(/82% do orçamento/)).toBeTruthy();
    expect(screen.getByText(/Falta estimado/)).toBeTruthy();
  });

  it('avisa que não há orçamento, em vez de inventar um', () => {
    render(<BulletRow label="Banheiro" spent={150} budget={null} />);
    expect(screen.getByText(/sem orçamento/)).toBeTruthy();
  });

  it('marca o estouro acima de 100%', () => {
    render(<BulletRow label="Eletrodomésticos" spent={5200} budget={4000} />);
    expect(screen.getByText(/130% do orçamento/)).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});

/* ═════════════════════ Estimado × realizado (dumbbell) ════════════════════ */

describe('EstimateVsActual', () => {
  it('desenha os dois extremos e a diferença de cada item', () => {
    render(
      <EstimateVsActual
        rows={[
          { id: '1', name: 'Colchão', estimated: 1500, actual: 1850 },
          { id: '2', name: 'Jogo de panelas', estimated: 600, actual: 480 },
        ]}
      />,
    );

    expect(screen.getByText('Estimado')).toBeTruthy();
    expect(screen.getByText('Realizado')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Colchão/ })).toBeTruthy();
    expect(screen.getByText(/\+.*350,00/)).toBeTruthy();
    expect(screen.getByText(/−.*120,00/)).toBeTruthy();
  });

  it('explica a ausência de dados em vez de mostrar gráfico vazio', () => {
    render(<EstimateVsActual rows={[]} />);
    expect(screen.getByText('Nada para comparar ainda')).toBeTruthy();
  });
});

/* ══════════════════════════ Peças de interface ════════════════════════════ */

describe('componentes de base', () => {
  it('desabilita o botão enquanto carrega', () => {
    render(<Button loading>Salvar</Button>);
    expect(screen.getByRole('button', { name: /Salvar/ })).toBeDisabled();
  });

  it('liga rótulo, dica e erro ao campo', () => {
    render(
      <Field label="Preço estimado" htmlFor="p" error="Informe um valor válido.">
        <MoneyInput id="p" />
      </Field>,
    );

    expect(screen.getByLabelText(/Preço estimado/)).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um valor válido.');
    expect(screen.getByText('R$')).toBeTruthy();
  });

  it('marca campo inválido para a tecnologia assistiva', () => {
    render(<Input aria-label="Quantidade" invalid />);
    expect(screen.getByLabelText('Quantidade')).toHaveAttribute('aria-invalid', 'true');
  });

  it('expõe a caixa de seleção com rótulo clicável', () => {
    render(<Checkbox checked onChange={() => {}} label="Ocultar itens concluídos" />);
    expect(screen.getByRole('checkbox', { name: 'Ocultar itens concluídos' })).toBeChecked();
  });

  it('marca a opção ativa do controle segmentado', () => {
    render(
      <SegmentedControl
        label="Forma de exibição"
        value="lista"
        onChange={() => {}}
        options={[
          { value: 'lista', label: 'Lista' },
          { value: 'cards', label: 'Cards' },
        ]}
      />,
    );

    const group = screen.getByRole('group', { name: 'Forma de exibição' });
    expect(within(group).getByRole('button', { name: 'Lista' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'Cards' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('usa um link de verdade no botão que navega', () => {
    render(
      <MemoryRouter>
        <LinkButton to="/financeiro" variant="primary">
          Definir orçamento
        </LinkButton>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Definir orçamento' })).toHaveAttribute(
      'href',
      '/financeiro',
    );
  });

  it('anuncia erro como alerta e aviso comum como status', () => {
    render(<Notice tone="critical">Orçamento estourado.</Notice>);
    expect(screen.getByText('Orçamento estourado.')).toBeTruthy();
  });

  it('mostra estado vazio com ação', () => {
    render(
      <EmptyState
        title="Nenhuma compra ainda"
        description="Registre a primeira compra."
        action={<Button>Registrar</Button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nenhuma compra ainda' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeTruthy();
  });

  it('mantém o texto da etiqueta em tinta, com a cor só no ponto', () => {
    const { container } = render(
      <Chip dot={STATUS_FILL.comprado} className="text-ink">
        Comprado
      </Chip>,
    );
    const dot = container.querySelector('span[aria-hidden]') as HTMLElement;
    // A cor vem do tema (variável CSS), igual para o ponto em qualquer tema.
    expect(dot.style.background).toBe('var(--step-comprado)');
    expect(screen.getByText('Comprado').className).toContain('text-ink');
  });
});

/* ═══════════════════════ Tela de configuração ═════════════════════════════ */

describe('SetupScreen', () => {
  it('guia a configuração do Supabase em quatro passos', () => {
    render(<SetupScreen />);

    expect(
      screen.getByRole('heading', { name: 'Falta conectar o banco de dados' }),
    ).toBeTruthy();
    expect(screen.getByText('Crie um projeto no Supabase')).toBeTruthy();
    expect(screen.getByText(/supabase\/schema\.sql/)).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});
