import { IconName } from '../components/common/icon/icon.component';
import { Category } from '../../models/domain.models';

const categoryIcons: Record<string, IconName> = {
  'habitacao': 'home', 'servicos da casa': 'house-services', 'alimentacao': 'food', 'transportes': 'car',
  'saude': 'health', 'cuidados pessoais': 'care', 'compras pessoais': 'shopping', 'educacao': 'education',
  'lazer e cultura': 'entertainment', 'viagens': 'travel', 'familia e dependentes': 'family', 'animais': 'pets',
  'subscricoes digitais': 'cloud', 'obrigacoes financeiras': 'finance', 'presentes e donativos': 'gift', 'outros': 'other',
};

const subcategoryIcons: Record<string, IconName> = {
  'renda ou prestacao': 'home', 'condominio': 'building', 'manutencao e reparacoes': 'tools', 'mobiliario': 'chair', 'seguro da casa': 'shield', 'imi e outras taxas': 'receipt',
  'eletricidade': 'bolt', 'agua': 'water', 'gas': 'flame', 'internet e televisao': 'wifi', 'telemovel': 'phone',
  'supermercado': 'basket', 'restaurantes': 'restaurant', 'takeaway e delivery': 'takeaway', 'cafes e snacks': 'coffee',
  'combustivel ou carregamento': 'fuel', 'transportes publicos': 'transit', 'taxi e tvde': 'taxi', 'manutencao': 'tools', 'seguro': 'shield', 'iuc': 'car', 'portagens': 'toll', 'estacionamento': 'parking',
  'consultas': 'health', 'exames': 'medical-test', 'farmacia': 'medicine', 'dentista': 'tooth', 'saude mental': 'mind', 'seguro ou plano de saude': 'shield',
  'cabeleireiro': 'scissors', 'estetica': 'sparkle', 'cosmetica': 'care', 'ginasio e bem-estar': 'fitness', 'ginasio e bem estar': 'fitness',
  'roupa': 'shirt', 'calcado': 'shoe', 'eletronica': 'device', 'acessorios': 'shopping', 'outras compras': 'shopping',
  'cursos': 'education', 'propinas': 'receipt', 'livros': 'book', 'material escolar': 'pencil', 'software educativo': 'laptop',
  'cinema': 'film', 'espetaculos': 'ticket', 'hobbies': 'hobby', 'jogos': 'game', 'saidas e vida noturna': 'nightlife',
  'transporte': 'transit', 'alojamento': 'bed', 'atividades': 'ticket', 'seguro de viagem': 'shield',
  'creche': 'family', 'escola': 'education', 'mesadas': 'coins', 'apoio familiar': 'family',
  'veterinario': 'pets', 'medicacao': 'medicine', 'higiene': 'clean',
  'streaming': 'play', 'musica': 'music', 'software': 'laptop', 'aplicacoes': 'apps', 'armazenamento cloud': 'cloud',
  'comissoes bancarias': 'bank', 'juros': 'percent', 'emprestimos': 'bank', 'impostos': 'receipt', 'taxas': 'receipt',
  'presentes': 'gift', 'caridade': 'heart', 'contribuicoes': 'heart', 'despesas pontuais': 'other', 'sem classificacao': 'other',
};

const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT').trim();

export function expenseIcon(categoryName: string, subcategoryName?: string): IconName {
  return (subcategoryName && subcategoryIcons[normalize(subcategoryName)]) || categoryIcons[normalize(categoryName)] || 'expenses';
}

export function expenseIconFor(categories: readonly Category[], categoryId: string, subcategoryId?: string): IconName {
  const category = categories.find((item) => item.id === categoryId);
  return expenseIcon(category?.name ?? '', category?.subcategories.find((item) => item.id === subcategoryId)?.name);
}
