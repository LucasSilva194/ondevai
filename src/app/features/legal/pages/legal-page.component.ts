import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="page legal-page">
      <a routerLink="/" class="text-link">← Voltar ao OndeVai</a>
      @if (privacy) {
        <header class="page-header"><p class="eyebrow">Informação legal</p><h1>Política de privacidade</h1><p class="page-intro">Última atualização: 2 de outubro de 2026 · Versão 2026-10-02-v2</p></header>
        <aside class="legal-incomplete" role="status"><strong>Falta o endereço postal do operador</strong><p>O endereço postal de Lucas Silva tem de ser adicionado antes da publicação.</p></aside>
        <section><h2>Quem trata os dados</h2><p>O serviço OndeVai é operado por <strong>Lucas Silva</strong>, com endereço em <strong>[PREENCHER: endereço postal]</strong>. Contacto para privacidade: <a href="mailto:lucas.silva98@outlook.pt">lucas.silva98@outlook.pt</a>.</p></section>
        <section><h2>Dados e finalidades</h2><p>Para criar e proteger a conta, tratamos o endereço de email e as credenciais de autenticação. Os dados financeiros que introduz — despesas, rendimentos, categorias, orçamentos e objetivos — são tratados para apresentar as funcionalidades pedidas. Não ligamos contas bancárias, não fazemos publicidade comportamental e o projeto não integra analytics nem telemetria.</p><p>Os dados cloud são guardados numa instância PocketBase alojada pelo PocketHost (<a href="https://ondevai.pockethost.io">ondevai.pockethost.io</a>). O PocketHost presta a infraestrutura de alojamento. A região de alojamento, o papel contratual exato do fornecedor e os termos de tratamento aplicáveis têm de ser confirmados pelo operador.</p></section>
        <section><h2>Armazenamento no dispositivo</h2><p>A sessão de autenticação é guardada no armazenamento local do browser (localStorage). O service worker guarda recursos estáticos da aplicação em cache para permitir o seu carregamento; não guarda os seus dados financeiros cloud. Uma versão antiga do OndeVai pode ter criado dados no IndexedDB. Esses dados legados só são consultados para migração, permanecem no dispositivo até serem apagados por si e podem ser removidos na área Dados e privacidade. O OndeVai não usa cookies de publicidade nem cookies de analytics.</p></section>
        <section><h2>Partilha e conservação</h2><p>Os dados são enviados ao PocketHost para fornecer a conta e as funcionalidades. O OndeVai não vende os seus dados nem os partilha para publicidade. Os dados da conta e os dados financeiros são conservados por dois anos, salvo se os apagar antes através da área Dados e privacidade. As cópias de segurança operacionais são conservadas por dois anos após a sua criação.</p><p>Pode exportar os seus dados, apagar os dados financeiros cloud ou eliminar a conta através da área Dados e privacidade. A eliminação na aplicação não remove imediatamente cópias de segurança já criadas, que são eliminadas ao fim de dois anos. Uma exportação descarregada por si não é cifrada automaticamente.</p></section>
        <section><h2>Os seus direitos</h2><p>Consoante a lei aplicável, pode pedir acesso, retificação, apagamento, limitação ou oposição ao tratamento e pode apresentar reclamação à autoridade de controlo competente. Use os controlos de exportação e eliminação da aplicação ou contacte <a href="mailto:lucas.silva98@outlook.pt">lucas.silva98@outlook.pt</a>. Para proteger a conta, podemos pedir informação razoável para confirmar a identidade.</p></section>
        <section><h2>Idade</h2><p>O OndeVai não define uma idade mínima para criar conta. A aplicação destina-se à gestão de finanças pessoais e não foi concebida especificamente para crianças.</p></section>
        <section><h2>Alterações</h2><p>Esta política pode ser atualizada. A versão e a data acima identificam o texto associado ao registo de aceitação feito durante a criação da conta.</p></section>
      } @else {
        <header class="page-header"><p class="eyebrow">Informação legal</p><h1>Termos de utilização</h1><p class="page-intro">Última atualização: 2 de outubro de 2026 · Versão 2026-10-02-v2</p></header>
        <aside class="legal-incomplete" role="status"><strong>Falta o endereço postal do operador</strong><p>O endereço postal de Lucas Silva tem de ser adicionado antes da publicação.</p></aside>
        <section><h2>Operador e âmbito</h2><p>O OndeVai é operado por <strong>Lucas Silva</strong>, com endereço em <strong>[PREENCHER: endereço postal]</strong> e contacto em <a href="mailto:lucas.silva98@outlook.pt">lucas.silva98@outlook.pt</a>. Estes termos regem o uso da aplicação para organizar finanças pessoais.</p></section>
        <section><h2>Conta e elegibilidade</h2><p>Não existe uma idade mínima definida para criar conta. É necessário fornecer um endereço de email válido, manter as credenciais seguras e usar uma palavra-passe adequada. O email tem de ser confirmado antes do acesso aos dados financeiros.</p></section>
        <section><h2>Utilização do serviço</h2><p>O OndeVai permite registar e consultar informação financeira pessoal. Não liga a bancos, não verifica a exatidão dos valores que introduz e não presta aconselhamento financeiro, fiscal ou de investimento. Mantenha uma cópia exportada dos dados importantes; os ficheiros exportados não são cifrados.</p><p>Use a aplicação de forma lícita, não tente aceder a contas ou dados de outras pessoas e não interfira com a segurança ou disponibilidade do serviço.</p></section>
        <section><h2>Disponibilidade e preço</h2><p>Atualmente não existem planos pagos, checkout ou funcionalidades pagas. O acesso é gratuito e não há cobranças ou renovações. Não se aplica uma política de reembolso enquanto não existirem pagamentos. Qualquer futura alteração de preço será apresentada antes de qualquer compromisso.</p><p>O serviço depende da disponibilidade do PocketHost e da ligação à internet. Não garantimos disponibilidade ininterrupta. Podemos corrigir, suspender ou descontinuar funcionalidades por razões operacionais ou de segurança, informando os utilizadores quando razoavelmente possível.</p></section>
        <section><h2>Dados e encerramento</h2><p>O tratamento de dados pessoais está descrito na <a routerLink="/privacidade">Política de privacidade</a>. Pode exportar ou eliminar os dados e encerrar a conta na área Dados e privacidade. Os dados são conservados por dois anos salvo eliminação anterior pelo utilizador; as cópias de segurança são conservadas por dois anos após a sua criação.</p></section>
        <section><h2>Alterações e contacto</h2><p>Podemos atualizar estes termos para refletir alterações ao serviço ou requisitos legais. A versão atual é identificada pela data no início desta página. Para questões sobre estes termos, contacte <a href="mailto:lucas.silva98@outlook.pt">lucas.silva98@outlook.pt</a>.</p><p>Lei aplicável e entidade de resolução de litígios: a determinar pelo operador em função da sua jurisdição.</p></section>
      }
      <footer class="legal-footer"><a routerLink="/privacidade">Privacidade</a><a routerLink="/termos">Termos de utilização</a><a routerLink="/">OndeVai</a></footer>
    </main>
  `,
  styles: [`
    .legal-page { max-width: 900px; }
    .legal-page > .text-link { display: inline-block; margin-bottom: 30px; }
    .legal-page h1 { max-width: none; }
    .legal-page section { margin: 30px 0; }
    .legal-page section h2 { margin-bottom: 10px; }
    .legal-page section p { max-width: 75ch; line-height: 1.7; }
    .legal-incomplete { margin: 24px 0; padding: 18px 20px; border: 1px solid var(--warning); border-radius: var(--radius-inner); background: var(--warning-soft); color: var(--text); }
    .legal-incomplete p { margin: 6px 0 0; line-height: 1.5; }
    .legal-footer { display: flex; flex-wrap: wrap; gap: 20px; border-top: 1px solid var(--border); padding-top: 20px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPageComponent {
  readonly privacy = inject(ActivatedRoute).snapshot.data['policy'] === 'privacy';
}
