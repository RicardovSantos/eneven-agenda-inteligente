import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { SettingsSection } from "@/components/settings/settings-section";
import { requireOnboarded } from "@/server/panel/onboarding-gate";

export const metadata: Metadata = { title: "Excluir conta" };

export default async function ExcluirContaPage() {
  const { session } = await requireOnboarded();
  const owner = session.role === "owner";
  const [user] = await (await getDb()).select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.userId)).limit(1);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={owner ? "/painel/configuracoes" : "/painel/mais"} className="text-sm text-primary">
          ‹ {owner ? "Configurações" : "Mais"}
        </Link>
        <h1 className="text-[1.75rem] font-semibold">Excluir conta</h1>
        <p className="m-0 text-ink-muted">
          {owner
            ? "Apaga a sua conta e o estabelecimento inteiro. Não dá para desfazer."
            : "Apaga a sua conta de acesso. Não dá para desfazer."}
        </p>
      </div>

      {session.support ? (
        <p role="status" className="m-0 rounded-field border border-line bg-surface p-4 text-sm">Indisponível no modo suporte.</p>
      ) : session.isSuperAdmin ? (
        <p role="status" className="m-0 rounded-field border border-line bg-surface p-4 text-sm">Contas da administração da plataforma não podem ser excluídas por aqui. Fale com a Eneven.</p>
      ) : (
        <>
          <SettingsSection id="o-que-acontece" title="O que acontece">
            {owner ? (
              <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-sm">
                <li>Clientes, agendamentos, serviços, equipe, fotos, página de agendamento e configurações são apagados na hora.</li>
                <li>As contas de acesso da sua equipe que só existiam neste estabelecimento também são apagadas.</li>
                <li>A assinatura de cartão é cancelada para não haver novas cobranças. Não há reembolso do mês em andamento.</li>
                <li>O link de agendamento do seu estabelecimento deixa de funcionar.</li>
                <li>Registros que a lei obriga a guardar, como o registro de acesso por 6 meses, e o histórico dos provedores de pagamento (Mercado Pago e Stripe) seguem as regras deles.</li>
              </ul>
            ) : (
              <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-sm">
                <li>Seu acesso, seu login e suas notificações neste aparelho são apagados na hora.</li>
                <li>Registros do estabelecimento ligados a você, como o seu nome na equipe e agendamentos já feitos, ficam com o estabelecimento, sem ligação com uma conta.</li>
                <li>O estabelecimento e os dados dele continuam existindo.</li>
              </ul>
            )}
          </SettingsSection>

          {owner ? (
            <p className="m-0 rounded-field border border-line bg-surface p-4 text-sm">
              Quer guardar uma cópia antes?{" "}
              <Link href="/painel/configuracoes/dados" className="font-medium text-primary underline underline-offset-2">Baixe os seus dados</Link>.
            </p>
          ) : null}

          <SettingsSection id="confirmar" title="Confirmar exclusão">
            <DeleteAccountForm hasPassword={Boolean(user?.passwordHash)} owner={owner} />
          </SettingsSection>
        </>
      )}
    </div>
  );
}
