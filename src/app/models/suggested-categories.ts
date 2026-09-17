import { Category, Subcategory } from './domain.models';

const subcategories = (categoryId: string, names: readonly string[]): Subcategory[] =>
  names.map((name, index) => ({
    id: `${categoryId}-sub-${index + 1}`,
    name,
    archived: false,
  }));

const category = (
  id: string,
  name: string,
  color: string,
  order: number,
  children: readonly string[],
): Category => ({
  id,
  name,
  color,
  order,
  archived: false,
  subcategories: subcategories(id, children),
});

export const SUGGESTED_CATEGORIES: readonly Category[] = [
  category('cat-habitacao', 'Habitação', '#52796f', 0, [
    'Renda ou prestação', 'Condomínio', 'Manutenção e reparações', 'Mobiliário', 'Seguro da casa', 'IMI e outras taxas',
  ]),
  category('cat-servicos-casa', 'Serviços da casa', '#3a7ca5', 1, [
    'Eletricidade', 'Água', 'Gás', 'Internet e televisão', 'Telemóvel',
  ]),
  category('cat-alimentacao', 'Alimentação', '#cb7c37', 2, [
    'Supermercado', 'Restaurantes', 'Takeaway e delivery', 'Cafés e snacks',
  ]),
  category('cat-transportes', 'Transportes', '#3f6690', 3, [
    'Combustível ou carregamento', 'Transportes públicos', 'Táxi e TVDE', 'Manutenção', 'Seguro', 'IUC', 'Portagens', 'Estacionamento',
  ]),
  category('cat-saude', 'Saúde', '#5f7f69', 4, [
    'Consultas', 'Exames', 'Farmácia', 'Dentista', 'Saúde mental', 'Seguro ou plano de saúde',
  ]),
  category('cat-cuidados-pessoais', 'Cuidados pessoais', '#a0616a', 5, [
    'Cabeleireiro', 'Estética', 'Cosmética', 'Ginásio e bem-estar',
  ]),
  category('cat-compras-pessoais', 'Compras pessoais', '#7a6f9b', 6, [
    'Roupa', 'Calçado', 'Eletrónica', 'Acessórios', 'Outras compras',
  ]),
  category('cat-educacao', 'Educação', '#467a6b', 7, [
    'Cursos', 'Propinas', 'Livros', 'Material escolar', 'Software educativo',
  ]),
  category('cat-lazer-cultura', 'Lazer e cultura', '#9a6b43', 8, [
    'Cinema', 'Espetáculos', 'Hobbies', 'Jogos', 'Livros', 'Saídas e vida noturna',
  ]),
  category('cat-viagens', 'Viagens', '#2e7d83', 9, [
    'Transporte', 'Alojamento', 'Alimentação', 'Atividades', 'Seguro de viagem',
  ]),
  category('cat-familia-dependentes', 'Família e dependentes', '#80604f', 10, [
    'Creche', 'Escola', 'Atividades', 'Mesadas', 'Apoio familiar',
  ]),
  category('cat-animais', 'Animais', '#718355', 11, [
    'Alimentação', 'Veterinário', 'Medicação', 'Higiene', 'Seguro',
  ]),
  category('cat-subscricoes-digitais', 'Subscrições digitais', '#586f8a', 12, [
    'Streaming', 'Música', 'Software', 'Aplicações', 'Armazenamento cloud',
  ]),
  category('cat-obrigacoes-financeiras', 'Obrigações financeiras', '#806d40', 13, [
    'Comissões bancárias', 'Juros', 'Empréstimos', 'Impostos', 'Taxas',
  ]),
  category('cat-presentes-donativos', 'Presentes e donativos', '#985e6d', 14, [
    'Presentes', 'Caridade', 'Contribuições',
  ]),
  category('cat-outros', 'Outros', '#68727d', 15, [
    'Despesas pontuais', 'Sem classificação',
  ]),
];

export function cloneSuggestedCategories(): Category[] {
  return SUGGESTED_CATEGORIES.map((item) => ({
    ...item,
    subcategories: item.subcategories.map((subcategory) => ({ ...subcategory })),
  }));
}
