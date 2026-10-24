/**
 * Textos de /termos e /privacidade.
 *
 * Transcritos de `docs/legal/termos-e-privacidade.md` (o rascunho para revisão
 * jurídica), sem a nota do editor. A partir daqui este arquivo é a versão que
 * vai ao ar; mudou o texto, mude a data em `LEGAL_LAST_UPDATED`.
 *
 * Os campos que o rascunho deixava entre colchetes vêm de variáveis de
 * ambiente (`LEGAL_OWNER_NAME`, `LEGAL_OWNER_DOC`, `LEGAL_CONTACT_EMAIL`) ou
 * dos padrões abaixo. Dentro dos textos, `**assim**` marca destaque.
 */

/** Data da última atualização dos textos (AAAA-MM-DD). */
export const LEGAL_LAST_UPDATED = "2026-10-24";

const DEFAULT_OWNER_NAME = "Ricardo Santos";
const DEFAULT_CONTACT_EMAIL = "eneventech@gmail.com";

export type LegalContext = {
  /** Responsável pela plataforma (controlador dos dados das contas e DPO). */
  ownerName: string;
  /** CPF ou CNPJ do responsável; vazio = omitido do texto. */
  ownerDoc: string;
  contactEmail: string;
};

export type LegalBlock = { type: "p"; text: string } | { type: "ul"; items: string[] };

export type LegalSection = { heading: string; blocks: LegalBlock[] };

export type LegalDocument = {
  title: string;
  /** Texto antes da primeira seção. */
  intro: LegalBlock[];
  sections: LegalSection[];
};

/** Lê as variáveis `LEGAL_*`; vazias ou só com espaços caem no padrão (o documento, em vazio). */
export function getLegalContext(
  env: Record<string, string | undefined> = process.env,
): LegalContext {
  const pick = (name: string, fallback: string) => env[name]?.trim() || fallback;
  return {
    ownerName: pick("LEGAL_OWNER_NAME", DEFAULT_OWNER_NAME),
    ownerDoc: pick("LEGAL_OWNER_DOC", ""),
    contactEmail: pick("LEGAL_CONTACT_EMAIL", DEFAULT_CONTACT_EMAIL),
  };
}

/** "2026-10-24" vira "24/10/2026". */
export function formatLegalDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

const p = (text: string): LegalBlock => ({ type: "p", text });
const ul = (...items: string[]): LegalBlock => ({ type: "ul", items });

export function buildTermsDocument({ ownerName, ownerDoc, contactEmail }: LegalContext): LegalDocument {
  const responsible = ownerDoc ? `${ownerName} (${ownerDoc})` : ownerName;

  return {
    title: "Termos de uso",
    intro: [],
    sections: [
      {
        heading: "1. Quem somos",
        blocks: [
          p(
            `A Eneven Agendamentos Inteligentes ("Eneven Agenda", "plataforma") é um serviço on-line de agenda e agendamento oferecido pela Eneven Tech, sob responsabilidade de ${responsible}, contato ${contactEmail}.`,
          ),
        ],
      },
      {
        heading: "2. O que a plataforma faz",
        blocks: [
          p(
            "A plataforma permite que estabelecimentos (salões, estúdios, clínicas de estética e similares) organizem sua agenda e recebam agendamentos de clientes por um link próprio. A plataforma é uma ferramenta: os serviços agendados são prestados exclusivamente pelo estabelecimento, que é o único responsável por eles, por seus preços, horários, atendimento e cancelamentos.",
          ),
        ],
      },
      {
        heading: "3. Conta do estabelecimento",
        blocks: [
          ul(
            "Para usar o painel é preciso criar uma conta com dados verdadeiros. Você é responsável pelo sigilo da sua senha e por tudo o que for feito na sua conta, inclusive por usuários que você convidar.",
            "Você pode entrar com e-mail e senha ou com a sua conta Google.",
            "Podemos suspender contas usadas para fraude, spam, conteúdo ilegal ou que violem estes termos.",
          ),
        ],
      },
      {
        heading: "4. Teste grátis, planos e pagamento",
        blocks: [
          ul(
            "Novas contas têm 14 dias de teste grátis, sem cartão de crédito.",
            "Após o teste, o uso continua mediante assinatura de um dos planos exibidos no painel. Preços, limites (como número de profissionais e franquia de mensagens) e condições aparecem no momento da assinatura.",
            "A assinatura é mensal e renovada automaticamente até ser cancelada. O cancelamento pode ser feito a qualquer momento pelo painel e vale ao fim do período já pago; não há reembolso proporcional de mês em curso, salvo quando exigido por lei.",
            "Sem pagamento após o vencimento, a conta pode passar para o modo somente leitura, sem receber novos agendamentos, até a regularização.",
          ),
        ],
      },
      {
        heading: "5. Mensagens de lembrete",
        blocks: [
          p(
            "A plataforma pode enviar, em nome do estabelecimento, mensagens transacionais (confirmação, lembrete, remarcação e cancelamento) por WhatsApp, usando a API oficial do WhatsApp, e por e-mail, aos clientes que agendarem. O estabelecimento se compromete a usar esse recurso apenas para comunicações relacionadas aos agendamentos, nunca para propaganda.",
          ),
        ],
      },
      {
        heading: "6. Uso permitido",
        blocks: [
          p(
            "É proibido: usar a plataforma para atividades ilegais; cadastrar dados de terceiros sem base legal; tentar acessar dados de outros estabelecimentos; sobrecarregar, copiar ou fazer engenharia reversa do sistema; revender o acesso sem autorização.",
          ),
        ],
      },
      {
        heading: "7. Disponibilidade",
        blocks: [
          p(
            "Trabalhamos para manter a plataforma no ar o tempo todo, com backups diários, mas não garantimos funcionamento ininterrupto. Manutenções programadas serão avisadas com antecedência sempre que possível.",
          ),
        ],
      },
      {
        heading: "8. Dados e propriedade",
        blocks: [
          p(
            "Os dados cadastrados pelo estabelecimento (clientes, serviços, agenda) pertencem ao estabelecimento. Ao cancelar, você pode exportá-los pelo painel; após 90 dias do encerramento eles são excluídos ou anonimizados. O software, a marca e o design da plataforma pertencem à Eneven Tech.",
          ),
        ],
      },
      {
        heading: "9. Responsabilidade",
        blocks: [
          p(
            "A plataforma não se responsabiliza por perdas decorrentes de serviços prestados pelo estabelecimento, de faltas de clientes, de informações incorretas cadastradas pelo usuário, nem de indisponibilidade de serviços de terceiros (como WhatsApp, Google ou provedores de pagamento). Nossa responsabilidade total fica limitada ao valor pago pelo estabelecimento nos últimos 3 meses.",
          ),
        ],
      },
      {
        heading: "10. Alterações",
        blocks: [
          p(
            "Podemos atualizar estes termos. Mudanças relevantes serão avisadas no painel ou por e-mail com pelo menos 15 dias de antecedência.",
          ),
        ],
      },
      {
        heading: "11. Lei e foro",
        blocks: [
          p(
            "Estes termos seguem a legislação brasileira, inclusive o Código de Defesa do Consumidor quando aplicável. Fica eleito o foro do domicílio do consumidor ou, nos demais casos, o da comarca de São Paulo/SP.",
          ),
        ],
      },
    ],
  };
}

export function buildPrivacyDocument({ ownerName, contactEmail }: LegalContext): LegalDocument {
  return {
    title: "Política de privacidade",
    intro: [
      p(
        "Esta política explica como tratamos dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).",
      ),
    ],
    sections: [
      {
        heading: "1. Papéis",
        blocks: [
          ul(
            "**Dados das contas dos estabelecimentos** (dono, recepção, profissionais): a Eneven Tech é a **controladora**.",
            "**Dados dos clientes que agendam** (nome, WhatsApp, e-mail, histórico de agendamentos): o **estabelecimento é o controlador**, e a Eneven Tech atua como **operadora**, tratando esses dados apenas para prestar o serviço de agenda, conforme as instruções do estabelecimento.",
          ),
        ],
      },
      {
        heading: "2. Dados que coletamos",
        blocks: [
          ul(
            "**Conta do estabelecimento:** nome, e-mail, WhatsApp, nome do estabelecimento, senha (guardada apenas em forma criptografada irreversível) ou identificador da conta Google, foto do perfil Google (quando usado o login com Google), dados de uso do painel e registros técnicos (endereço IP, data e hora de acesso).",
            "**Clientes que agendam:** nome, WhatsApp, e-mail (opcional), serviços agendados, datas, horários, status de comparecimento e observações registradas pelo estabelecimento.",
            "**Pagamentos:** processados pelo Mercado Pago; não armazenamos números de cartão.",
          ),
        ],
      },
      {
        heading: "3. Para que usamos",
        blocks: [
          ul(
            "Criar e manter as contas, autenticar o acesso e prestar o serviço de agenda (execução de contrato).",
            "Enviar confirmações, lembretes e avisos de remarcação ou cancelamento dos agendamentos (execução de contrato e legítimo interesse do estabelecimento e do cliente).",
            "Enviar e-mails de conta, como confirmação de e-mail, recuperação de senha e avisos de cobrança (execução de contrato).",
            "Segurança, prevenção a fraudes e cumprimento de obrigações legais (legítimo interesse e obrigação legal).",
            "Não vendemos dados pessoais e não usamos os dados dos clientes dos estabelecimentos para publicidade.",
          ),
        ],
      },
      {
        heading: "4. Compartilhamento",
        blocks: [
          p(
            "Compartilhamos dados apenas com fornecedores necessários ao serviço: hospedagem (servidor próprio em provedor de nuvem), envio de e-mails (ZeptoMail/Zoho), envio de mensagens (WhatsApp Business Platform da Meta), login (Google, quando escolhido) e pagamentos (Mercado Pago). Esses fornecedores podem tratar dados fora do Brasil, com as salvaguardas previstas na LGPD.",
          ),
        ],
      },
      {
        heading: "5. Por quanto tempo guardamos",
        blocks: [
          ul(
            "Enquanto a conta estiver ativa.",
            "Após o encerramento, por até 90 dias para permitir reativação e exportação; depois, os dados são excluídos ou anonimizados, exceto o que a lei obrigar a manter (por exemplo, registros de acesso por 6 meses, conforme o Marco Civil da Internet, e dados fiscais pelo prazo legal).",
          ),
        ],
      },
      {
        heading: "6. Segurança",
        blocks: [
          p(
            "Usamos conexão criptografada (HTTPS), senhas com criptografia forte, separação de dados por estabelecimento, controle de acesso por perfil e backups diários.",
          ),
        ],
      },
      {
        heading: "7. Seus direitos",
        blocks: [
          p(
            `Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, exclusão e informações sobre compartilhamento, além de revogar consentimentos. Clientes de um estabelecimento devem, preferencialmente, falar com o próprio estabelecimento; também podem escrever para ${contactEmail}, que encaminharemos o pedido.`,
          ),
        ],
      },
      {
        heading: "8. Cookies",
        blocks: [
          p(
            "Usamos apenas cookies essenciais: o de sessão (para manter você conectado) e cookies temporários de segurança do login com Google. Não usamos cookies de publicidade.",
          ),
        ],
      },
      {
        heading: "9. Contato",
        blocks: [p(`Encarregado de dados (DPO): ${ownerName} — ${contactEmail}.`)],
      },
      {
        heading: "10. Alterações",
        blocks: [
          p(
            "Esta política pode ser atualizada; a versão vigente fica sempre nesta página, com a data da última atualização.",
          ),
        ],
      },
    ],
  };
}
