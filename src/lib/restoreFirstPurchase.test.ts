import { describe, expect, it } from 'vitest';
import { planFirstPurchaseRestore } from './restoreFirstPurchase';
import { listOfCategory } from './lists';

describe('planFirstPurchaseRestore', () => {
  it('devolve as 3 categorias da primeira compra, com os 34 itens, a um espaço sem elas', () => {
    const plano = planFirstPurchaseRestore([{ code: 'A' }, { code: 'K' }]);
    expect(plano.map((c) => c.code)).toEqual(['G', 'M', 'N']);
    expect(plano.flatMap((c) => c.items)).toHaveLength(34);
    expect(plano.every((c) => listOfCategory(c) === 'pc')).toBe(true);
  });

  it('não recria categoria que já existe, mesmo se faltarem itens nela', () => {
    const plano = planFirstPurchaseRestore([{ code: 'G' }, { code: 'n' }]);
    expect(plano.map((c) => c.code)).toEqual(['M']);
  });

  it('com as três presentes, não há nada a fazer', () => {
    expect(planFirstPurchaseRestore([{ code: 'G' }, { code: 'M' }, { code: 'N' }])).toEqual([]);
  });

  it('traduz a prioridade do catálogo e mantém as observações', () => {
    const [mercado] = planFirstPurchaseRestore([{ code: 'G' }, { code: 'M' }]);
    const cafe = mercado.items.find((i) => i.name === 'Café');
    const arroz = mercado.items.find((i) => i.name === 'Arroz');
    expect(cafe?.priority).toBe('opcional'); // "conforme preferência"
    expect(cafe?.notes).toMatch(/preferência/);
    expect(arroz?.priority).toBe('essencial');
    expect(arroz?.allow_fraction).toBe(true);
  });
});
