import { Bell, Building2, CreditCard, Database, MessageCircle, Plus, Tag } from "lucide-react";
import type { Metadata } from "next";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-nav";
import { requireSuperAdminSession } from "@/server/auth/guard";
import { liveBillingEnabled } from "@/server/billing/mode";
import { pushAvailable } from "@/server/push/mode";

export const metadata: Metadata = { title: "Gerenciar" };

/** Índice da Plataforma: cada área numa categoria, em vez de links soltos na lista de estabelecimentos. */
export default async function GerenciarPage() {
  await requireSuperAdminSession();
  const billingReview = process.env.NODE_ENV !== "production" || liveBillingEnabled();

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pb-10 pt-6 lg:px-8 lg:pt-7">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[1.75rem] font-semibold">Gerenciar</h1>
        <p className="m-0 text-sm text-ink-muted">Tudo da plataforma, por categoria.</p>
      </div>

      <SettingsGroup title="Estabelecimentos e planos">
        <SettingsRow href="/admin" Icon={Building2} label="Estabelecimentos" description="Lista, testes, planos e uso de cada salão" />
        <SettingsRow href="/admin/estabelecimentos/novo" Icon={Plus} label="Novo estabelecimento" description="Criar e enviar o acesso ao dono" />
        <SettingsRow href="/admin/planos" Icon={Tag} label="Planos e preços" description="Editar limites e valores dos planos" />
      </SettingsGroup>

      <SettingsGroup title="WhatsApp">
        <SettingsRow href="/admin/whatsapp" Icon={MessageCircle} label="WhatsApp da plataforma" description="Uso do limite diário, custo e ocorrências para revisar" />
      </SettingsGroup>

      <SettingsGroup title="Para revisar">
        {billingReview ? (
          <SettingsRow href="/admin/cobranca" Icon={CreditCard} label="Assinaturas e avisos" description="Cobranças e avisos com resultado incerto" />
        ) : null}
        <SettingsRow href="/admin/dados" Icon={Database} label="Dados inativos" description="Testes vencidos e cancelamentos antigos" />
        {pushAvailable() ? (
          <SettingsRow href="/admin/notificacoes" Icon={Bell} label="Notificações de teste" description="Entregas incertas e dispositivos expirados" />
        ) : null}
      </SettingsGroup>

    </main>
  );
}
