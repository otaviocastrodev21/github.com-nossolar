/**
 * Catálogo inicial do enxoval — fonte única de verdade.
 *
 * Alimenta `supabase/migrations/0004_catalog_seed.sql`, gerado por
 * `node scripts/gen-catalog-sql.mjs`. Nenhum preço é sugerido: todos os itens
 * nascem com preço estimado R$ 0,00, quantidade comprada 0 e status "pendente".
 *
 * Códigos de prioridade (seção 11 do briefing):
 *   E = Essencial | I = Importante | O = Opcional
 *   N = "Conforme necessidade"  -> opcional + condicional (depende da residência)
 *   P = "Conforme preferência"  -> opcional + observação
 *   K = "Conforme consumo"      -> importante + observação
 *
 * Unidades de controle: unidade, peça, par, jogo, conjunto, pacote, embalagem,
 * lote, tarefa.
 *
 * Flags opcionais por item:
 *   task    -> tarefa de verificação (não entra em orçamento nem em quantidades)
 *   frac    -> aceita quantidade fracionada (peso/volume de supermercado)
 *   qtyOpen -> quantidade "conforme necessidade": o casal define
 *   note    -> observação inicial
 */

const i = (name, qty, unit, prio, sub, extra = {}) => ({ name, qty, unit, prio, sub, ...extra });
const cat = (code, name, icon, items) => ({ code, name, icon, items });

export const catalog = [
  cat('A', 'Quarto do casal', 'bed', [
    i('Cama de casal ou queen', 1, 'unidade', 'E', 'Cama e colchão'),
    i('Colchão', 1, 'unidade', 'E', 'Cama e colchão'),
    i('Protetor impermeável para colchão', 1, 'unidade', 'E', 'Cama e colchão'),
    i('Travesseiros para dormir', 2, 'unidade', 'E', 'Cama e colchão'),
    i('Travesseiros extras', 2, 'unidade', 'O', 'Cama e colchão'),
    i('Jogos de lençol completos', 3, 'jogo', 'E', 'Roupa de cama', {
      note: 'Cada jogo costuma trazer lençol com elástico, lençol de cima e fronhas.',
    }),
    i('Edredom ou cobertor', 1, 'unidade', 'E', 'Roupa de cama'),
    i('Manta decorativa', 1, 'unidade', 'O', 'Roupa de cama'),
    i('Cobre-leito ou colcha', 1, 'unidade', 'O', 'Roupa de cama'),
    i('Fronhas extras', 4, 'unidade', 'O', 'Roupa de cama'),
    i('Mesas de cabeceira', 2, 'unidade', 'O', 'Mobiliário'),
    i('Luminárias de cabeceira', 2, 'unidade', 'O', 'Iluminação'),
    i('Guarda-roupa ou armário', 1, 'unidade', 'E', 'Mobiliário'),
    i('Cabides', 30, 'unidade', 'E', 'Organização'),
    i('Cesto para roupa suja', 1, 'unidade', 'E', 'Organização'),
    i('Cortina com varão ou trilho', 1, 'conjunto', 'E', 'Cortinas'),
    i('Espelho de corpo inteiro', 1, 'unidade', 'O', 'Decoração'),
    i('Lixeira pequena', 1, 'unidade', 'O', 'Organização'),
  ]),

  cat('B', 'Banheiro', 'shower-head', [
    i('Toalhas de banho', 4, 'unidade', 'E', 'Toalhas'),
    i('Toalhas de rosto', 2, 'unidade', 'E', 'Toalhas'),
    i('Toalhas de piso ou tapetes', 2, 'unidade', 'E', 'Toalhas'),
    i('Porta-sabonete líquido', 1, 'unidade', 'O', 'Acessórios'),
    i('Porta-escovas de dentes', 1, 'unidade', 'O', 'Acessórios'),
    i('Lixeira com tampa', 1, 'unidade', 'E', 'Acessórios'),
    i('Escova sanitária', 1, 'unidade', 'E', 'Acessórios'),
    i('Suporte para papel higiênico', 1, 'unidade', 'N', 'Acessórios'),
    i('Cortina de box', 1, 'unidade', 'N', 'Acessórios'),
    i('Espelho', 1, 'unidade', 'N', 'Acessórios'),
    i('Ganchos ou toalheiros', 1, 'conjunto', 'E', 'Acessórios'),
    i('Organizador para produtos', 1, 'unidade', 'O', 'Organização'),
    i('Papel higiênico para estoque inicial', 1, 'lote', 'E', 'Consumíveis'),
    i('Sabonetes, shampoo e condicionador', 1, 'lote', 'E', 'Consumíveis'),
    i('Creme dental e fio dental', 1, 'lote', 'E', 'Consumíveis'),
  ]),

  cat('C', 'Cozinha — panelas e utensílios', 'cooking-pot', [
    i('Jogo de panelas', 1, 'jogo', 'E', 'Panelas e assadeiras', { note: 'Jogo com 4 a 5 peças.' }),
    i('Frigideira antiaderente', 1, 'unidade', 'E', 'Panelas e assadeiras'),
    i('Panela de pressão', 1, 'unidade', 'E', 'Panelas e assadeiras'),
    i('Leiteira ou fervedor', 1, 'unidade', 'O', 'Panelas e assadeiras'),
    i('Assadeira retangular', 1, 'unidade', 'E', 'Panelas e assadeiras'),
    i('Forma de bolo', 1, 'unidade', 'O', 'Panelas e assadeiras'),
    i('Travessa refratária', 1, 'unidade', 'E', 'Panelas e assadeiras'),
    i('Tábua de corte', 1, 'unidade', 'E', 'Facas e corte'),
    i('Faca de chef', 1, 'unidade', 'E', 'Facas e corte'),
    i('Faca de legumes', 1, 'unidade', 'E', 'Facas e corte'),
    i('Faca de pão', 1, 'unidade', 'O', 'Facas e corte'),
    i('Tesoura de cozinha', 1, 'unidade', 'O', 'Facas e corte'),
    i('Escorredor de macarrão', 1, 'unidade', 'E', 'Preparo'),
    i('Peneira', 1, 'unidade', 'E', 'Preparo'),
    i('Ralador', 1, 'unidade', 'E', 'Preparo'),
    i('Abridor de latas', 1, 'unidade', 'E', 'Preparo'),
    i('Abridor de garrafas', 1, 'unidade', 'O', 'Preparo'),
    i('Saca-rolhas', 1, 'unidade', 'O', 'Preparo'),
    i('Descascador de legumes', 1, 'unidade', 'E', 'Preparo'),
    i('Espremedor de alho', 1, 'unidade', 'O', 'Preparo'),
    i('Espremedor de limão', 1, 'unidade', 'O', 'Preparo'),
    i('Conjunto de colheres medidoras', 1, 'conjunto', 'O', 'Medidores'),
    i('Conjunto de medidores de xícaras', 1, 'conjunto', 'O', 'Medidores'),
    i('Concha', 1, 'unidade', 'E', 'Utensílios de servir'),
    i('Escumadeira', 1, 'unidade', 'E', 'Utensílios de servir'),
    i('Espátula', 1, 'unidade', 'E', 'Utensílios de servir'),
    i('Colher grande de servir', 1, 'unidade', 'E', 'Utensílios de servir'),
    i('Pegador de alimentos', 1, 'unidade', 'O', 'Utensílios de servir'),
    i('Batedor de arame', 1, 'unidade', 'O', 'Preparo'),
    i('Pegadores de panela', 2, 'unidade', 'E', 'Proteção e apoio'),
    i('Descansos de panela', 2, 'unidade', 'E', 'Proteção e apoio'),
  ]),

  cat('D', 'Cozinha — pratos, copos e organização', 'utensils', [
    i('Pratos rasos', 6, 'unidade', 'E', 'Louças'),
    i('Pratos fundos', 6, 'unidade', 'E', 'Louças'),
    i('Pratos de sobremesa', 6, 'unidade', 'O', 'Louças'),
    i('Tigelas ou bowls', 6, 'unidade', 'E', 'Louças'),
    i('Copos de água', 6, 'unidade', 'E', 'Copos e canecas'),
    i('Canecas', 4, 'unidade', 'E', 'Copos e canecas'),
    i('Xícaras de café', 4, 'unidade', 'O', 'Copos e canecas'),
    i('Jogo de talheres para 6 pessoas', 1, 'jogo', 'E', 'Talheres'),
    i('Talheres de servir', 1, 'conjunto', 'E', 'Talheres'),
    i('Travessas para servir', 2, 'unidade', 'O', 'Servir'),
    i('Saladeira', 1, 'unidade', 'O', 'Servir'),
    i('Jarra de água', 1, 'unidade', 'E', 'Servir'),
    i('Garrafa térmica', 1, 'unidade', 'O', 'Servir'),
    i('Escorredor de louças', 1, 'unidade', 'E', 'Organização'),
    i('Porta-talheres', 1, 'unidade', 'O', 'Organização'),
    i('Porta-temperos', 1, 'unidade', 'O', 'Organização'),
    i('Saleiro', 1, 'unidade', 'O', 'Mesa'),
    i('Pimenteiro', 1, 'unidade', 'O', 'Mesa'),
    i('Açucareiro', 1, 'unidade', 'O', 'Mesa'),
    i('Manteigueira', 1, 'unidade', 'O', 'Mesa'),
    i('Potes herméticos para mantimentos', 1, 'conjunto', 'E', 'Armazenamento'),
    i('Potes para guardar alimentos', 8, 'unidade', 'E', 'Armazenamento'),
    i('Formas de gelo', 2, 'unidade', 'O', 'Armazenamento'),
  ]),

  cat('E', 'Eletrodomésticos', 'refrigerator', [
    i('Geladeira', 1, 'unidade', 'E', 'Grandes'),
    i('Fogão ou cooktop', 1, 'unidade', 'E', 'Grandes'),
    i('Forno, se não estiver integrado', 1, 'unidade', 'N', 'Grandes'),
    i('Micro-ondas', 1, 'unidade', 'I', 'Grandes'),
    i('Liquidificador', 1, 'unidade', 'I', 'Portáteis'),
    i('Cafeteira ou filtro de café', 1, 'unidade', 'P', 'Portáteis'),
    i('Air fryer', 1, 'unidade', 'O', 'Portáteis'),
    i('Sanduicheira', 1, 'unidade', 'O', 'Portáteis'),
    i('Batedeira', 1, 'unidade', 'O', 'Portáteis'),
    i('Mixer', 1, 'unidade', 'O', 'Portáteis'),
    i('Purificador ou filtro de água', 1, 'unidade', 'E', 'Água'),
    i('Coifa ou depurador', 1, 'unidade', 'N', 'Grandes'),
  ]),

  cat('F', 'Lavanderia e limpeza', 'washing-machine', [
    i('Máquina de lavar roupa', 1, 'unidade', 'E', 'Equipamentos'),
    i('Varal', 1, 'unidade', 'E', 'Equipamentos'),
    i('Cesto de roupas', 1, 'unidade', 'E', 'Organização'),
    i('Balde', 1, 'unidade', 'E', 'Utensílios'),
    i('Bacia', 1, 'unidade', 'O', 'Utensílios'),
    i('Vassoura', 1, 'unidade', 'E', 'Utensílios'),
    i('Rodo', 1, 'unidade', 'E', 'Utensílios'),
    i('Pá de lixo', 1, 'unidade', 'E', 'Utensílios'),
    i('Mop ou esfregão', 1, 'unidade', 'O', 'Utensílios'),
    i('Panos de chão', 4, 'unidade', 'E', 'Panos'),
    i('Panos de limpeza', 8, 'unidade', 'E', 'Panos'),
    i('Panos de prato', 4, 'unidade', 'E', 'Panos'),
    i('Esponjas de louça', 2, 'unidade', 'E', 'Panos'),
    i('Escova de limpeza', 1, 'unidade', 'E', 'Utensílios'),
    i('Escova para roupas', 1, 'unidade', 'O', 'Utensílios'),
    i('Luvas de limpeza', 1, 'par', 'E', 'Proteção'),
    i('Tábua de passar roupa', 1, 'unidade', 'O', 'Equipamentos'),
    i('Ferro de passar ou vaporizador', 1, 'unidade', 'O', 'Equipamentos'),
    i('Aspirador de pó', 1, 'unidade', 'O', 'Equipamentos'),
    i('Pregadores de roupa', 24, 'unidade', 'E', 'Organização'),
    i('Organizador para produtos de limpeza', 1, 'unidade', 'O', 'Organização'),
    i('Sacos de lixo variados', 1, 'lote', 'E', 'Consumíveis'),
  ]),

  cat('G', 'Produtos de limpeza', 'spray-can', [
    i('Detergente', 2, 'unidade', 'E', 'Louças'),
    i('Sabão para roupas', 1, 'embalagem', 'E', 'Roupas'),
    i('Amaciante', 1, 'embalagem', 'O', 'Roupas'),
    i('Desinfetante', 1, 'unidade', 'E', 'Geral'),
    i('Limpador multiuso', 1, 'unidade', 'E', 'Geral'),
    i('Limpador de banheiro', 1, 'unidade', 'E', 'Banheiro'),
    i('Água sanitária', 1, 'unidade', 'O', 'Geral'),
    i('Álcool para limpeza, quando apropriado', 1, 'unidade', 'O', 'Geral'),
    i('Sabão em barra', 1, 'embalagem', 'O', 'Roupas'),
    i('Papel-toalha', 1, 'pacote', 'O', 'Consumíveis'),
  ]),

  cat('H', 'Sala de estar', 'sofa', [
    i('Sofá de 2 ou 3 lugares', 1, 'unidade', 'E', 'Mobiliário'),
    i('Rack ou painel para TV', 1, 'unidade', 'I', 'Mobiliário'),
    i('Televisão', 1, 'unidade', 'O', 'Eletrônicos'),
    i('Mesa de centro ou lateral', 1, 'unidade', 'O', 'Mobiliário'),
    i('Tapete para sala', 1, 'unidade', 'O', 'Decoração'),
    i('Cortinas', 1, 'conjunto', 'E', 'Cortinas'),
    i('Almofadas decorativas', 4, 'unidade', 'O', 'Decoração'),
    i('Manta para sofá', 1, 'unidade', 'O', 'Decoração'),
    i('Luminária decorativa', 1, 'unidade', 'O', 'Iluminação'),
    i('Plantas ou objetos decorativos', 1, 'conjunto', 'O', 'Decoração'),
    i('Filtro de linha adequado', 1, 'unidade', 'E', 'Eletrônicos'),
  ]),

  cat('I', 'Sala de jantar e receber visitas', 'armchair', [
    i('Mesa de jantar', 1, 'unidade', 'E', 'Mobiliário'),
    i('Cadeiras', 4, 'unidade', 'E', 'Mobiliário'),
    i('Cadeiras extras', 2, 'unidade', 'O', 'Mobiliário'),
    i('Toalha de mesa', 1, 'unidade', 'O', 'Mesa posta'),
    i('Jogos americanos', 6, 'unidade', 'O', 'Mesa posta'),
    i('Guardanapos de tecido', 6, 'unidade', 'O', 'Mesa posta'),
    i('Descansos para copos', 6, 'unidade', 'O', 'Mesa posta'),
    i('Bandeja', 1, 'unidade', 'O', 'Servir'),
    i('Taças', 4, 'unidade', 'O', 'Copos e taças'),
    i('Copos extras', 4, 'unidade', 'O', 'Copos e taças'),
    i('Travessa grande', 1, 'unidade', 'O', 'Servir'),
  ]),

  cat('J', 'Organização geral', 'package', [
    i('Caixas organizadoras', 3, 'unidade', 'O', 'Armários'),
    i('Cestos para armários', 3, 'unidade', 'O', 'Armários'),
    i('Organizadores de gaveta', 2, 'unidade', 'O', 'Gavetas'),
    i('Sapateira', 1, 'unidade', 'N', 'Armários'),
    i('Prateleiras', 1, 'conjunto', 'N', 'Parede'),
    i('Ganchos', 1, 'conjunto', 'E', 'Parede'),
    i('Pasta para documentos e garantias', 1, 'unidade', 'E', 'Documentos'),
    i('Organizadores para cabos', 1, 'conjunto', 'O', 'Eletrônicos'),
    i('Lixeira para cozinha', 1, 'unidade', 'E', 'Lixeiras'),
    i('Lixeira para área de serviço', 1, 'unidade', 'E', 'Lixeiras'),
  ]),

  cat('K', 'Ferramentas e manutenção', 'wrench', [
    i('Caixa de ferramentas', 1, 'unidade', 'E', 'Ferramentas'),
    i('Jogo de chaves Phillips e de fenda', 1, 'jogo', 'E', 'Ferramentas'),
    i('Alicate universal', 1, 'unidade', 'E', 'Ferramentas'),
    i('Martelo', 1, 'unidade', 'E', 'Ferramentas'),
    i('Trena', 1, 'unidade', 'E', 'Medição'),
    i('Nível', 1, 'unidade', 'O', 'Medição'),
    i('Jogo de chaves Allen', 1, 'jogo', 'O', 'Ferramentas'),
    i('Parafusos e buchas variados', 1, 'conjunto', 'O', 'Fixação'),
    i('Fita isolante', 1, 'unidade', 'E', 'Fixação'),
    i('Fita veda-rosca', 1, 'unidade', 'E', 'Fixação'),
    i('Lanterna', 1, 'unidade', 'E', 'Emergência'),
    i('Pilhas compatíveis', 1, 'lote', 'N', 'Emergência'),
    i('Lâmpadas de reposição', 2, 'unidade', 'N', 'Elétrica'),
    i('Escadinha doméstica', 1, 'unidade', 'O', 'Ferramentas'),
    i('Kit básico de primeiros socorros', 1, 'unidade', 'E', 'Emergência'),
  ]),

  cat('L', 'Segurança da casa', 'shield-check', [
    i('Conferir fechaduras e cópias de chaves', 1, 'tarefa', 'E', 'Verificações', { task: true }),
    i('Verificar detectores de fumaça, quando aplicável', 1, 'tarefa', 'N', 'Verificações', { task: true }),
    i('Conferir tomadas, aterramento e disjuntores', 1, 'tarefa', 'E', 'Verificações', { task: true }),
    i('Verificar torneiras e possíveis vazamentos', 1, 'tarefa', 'E', 'Verificações', { task: true }),
    i('Conferir funcionamento dos chuveiros', 1, 'tarefa', 'E', 'Verificações', { task: true }),
    i('Separar contatos de emergência e manutenção', 1, 'tarefa', 'E', 'Verificações', { task: true }),
  ]),

  cat('M', 'Higiene pessoal', 'bath', [
    i('Escovas de dentes', 2, 'unidade', 'E', 'Bucal'),
    i('Sabonetes', 2, 'unidade', 'E', 'Banho', { note: 'Ajuste a quantidade conforme o consumo do casal.' }),
    i('Shampoo e condicionador', 1, 'lote', 'E', 'Banho'),
    i('Desodorantes', 2, 'unidade', 'E', 'Cuidados diários'),
    i('Creme dental', 1, 'unidade', 'E', 'Bucal'),
    i('Fio dental', 1, 'unidade', 'E', 'Bucal'),
    i('Algodão e cotonetes', 1, 'lote', 'O', 'Cuidados diários'),
    i('Produtos pessoais de uso habitual', 1, 'lote', 'E', 'Cuidados diários'),
    i('Medicamentos de uso habitual, se houver', 1, 'lote', 'N', 'Saúde', { qtyOpen: true }),
  ]),

  cat('N', 'Primeira compra de supermercado', 'shopping-cart', [
    i('Café', 1, 'pacote', 'P', 'Mercearia', { frac: true }),
    i('Açúcar ou adoçante', 1, 'embalagem', 'P', 'Mercearia', { frac: true }),
    i('Sal', 1, 'pacote', 'E', 'Mercearia', { frac: true }),
    i('Óleo ou azeite', 1, 'unidade', 'E', 'Mercearia', { frac: true }),
    i('Arroz', 1, 'pacote', 'E', 'Mercearia', { frac: true }),
    i('Feijão', 1, 'pacote', 'E', 'Mercearia', { frac: true }),
    i('Macarrão', 2, 'pacote', 'E', 'Mercearia', { frac: true }),
    i('Farinha e ingredientes habituais', 1, 'lote', 'P', 'Mercearia', { frac: true }),
    i('Temperos básicos', 1, 'lote', 'E', 'Mercearia', { frac: true }),
    i('Leite', 1, 'lote', 'K', 'Perecíveis', { frac: true }),
    i('Ovos', 1, 'embalagem', 'K', 'Perecíveis', { frac: true }),
    i('Pão', 1, 'lote', 'K', 'Perecíveis', { frac: true }),
    i('Manteiga ou margarina', 1, 'unidade', 'P', 'Perecíveis', { frac: true }),
    i('Água potável', 1, 'lote', 'E', 'Bebidas', { frac: true }),
    i('Alimentos para as primeiras refeições', 1, 'lote', 'E', 'Perecíveis', { frac: true }),
  ]),
];

export const PRIORITY_MAP = {
  E: { priority: 'essencial', note: null, conditional: false },
  I: { priority: 'importante', note: null, conditional: false },
  O: { priority: 'opcional', note: null, conditional: false },
  N: {
    priority: 'opcional',
    note: 'Depende da estrutura da residência — confirme a necessidade antes de comprar.',
    conditional: true,
  },
  P: { priority: 'opcional', note: 'Conforme a preferência do casal.', conditional: false },
  K: {
    priority: 'importante',
    note: 'Ajuste a quantidade conforme o consumo do casal.',
    conditional: false,
  },
};

export default catalog;
