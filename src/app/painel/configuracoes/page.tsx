import {
  Bell,
  Clock,
  CreditCard,
  Download,
  Globe,
  MessageCircle,
  Palette,
  SlidersHorizontal,
  Store,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-nav";
import { requirePanelRole } from "@/server/panel/roles";

export const metadata: Metadata = { title: "Configurações" };

const BASE = "/painel/configuracoes";

export default async function ConfiguracoesPage() {
  const { session } = await requirePanelRole(["owner"]);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.75rem] font-semibold">Configurações</h1>
        <p className="m-0 text-ink-muted">Escolha o que você quer ajustar.</p>
      </div>

      <SettingsGroup title="Geral">
        <SettingsRow href={`${BASE}/aparencia`} Icon={Palette} label="Aparência" description="Tema claro, escuro ou automático" />
        <SettingsRow href={`${BASE}/assinatura`} Icon={CreditCard} label="Plano e faturas" description="Seu plano, pagamento e faturas" />
        <SettingsRow href={`${BASE}/dados`} Icon={Download} label="Seus dados" description={session.support ? "Indisponível no modo suporte" : "Baixar uma cópia das suas informações"} />
      </SettingsGroup>

      <SettingsGroup title="Seu estabelecimento">
        <SettingsRow href={`${BASE}/estabelecimento`} Icon={Store} label="Dados e marca" description="Nome, contato, redes sociais, logo e cor" />
        <SettingsRow href={`${BASE}/pagina`} Icon={Globe} label="Página de agendamento" description="Fotos, textos e o link que seus clientes usam" />
      </SettingsGroup>

      <SettingsGroup title="Atendimento">
        <SettingsRow href={`${BASE}/horario`} Icon={Clock} label="Horário de atendimento" description="Dias e horários em que você atende" />
        <SettingsRow href={`${BASE}/regras`} Icon={SlidersHorizontal} label="Regras de agendamento" description="Intervalos, antecedência e cancelamento" />
      </SettingsGroup>

      <SettingsGroup title="Equipe">
        <SettingsRow href={`${BASE}/acessos`} Icon={Users} label="Acessos da equipe" description="Convidar pessoas e controlar o que cada uma vê" />
      </SettingsGroup>

      <SettingsGroup title="Avisos">
        <SettingsRow href={`${BASE}/mensagens`} Icon={MessageCircle} label="Mensagens no WhatsApp" description="Lembretes e confirmações para seus clientes" />
        <SettingsRow href={`${BASE}/notificacoes`} Icon={Bell} label="Notificações do aparelho" description="Avisos de agendamento neste dispositivo" />
      </SettingsGroup>
    </div>
  );
}
