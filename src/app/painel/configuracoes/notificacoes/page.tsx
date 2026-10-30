import type { Metadata } from "next";
import Link from "next/link";
import { requirePanelRole } from "@/server/panel/roles";
import { DeviceControls } from "./device-controls";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificacoesPage() {
  const { session } = await requirePanelRole(["owner"]);
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY || null;
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
    <Link href="/painel/configuracoes" className="text-sm text-primary">‹ Configurações</Link>
    <div><h1 className="text-[1.75rem] font-semibold">Notificações</h1><p className="text-ink-muted">Cadastre este dispositivo para receber avisos da agenda.</p></div>
    <section className="space-y-4 rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Avisos neste dispositivo</h2>
      <p className="text-sm text-ink-muted">O envio de avisos sobre agendamentos, cancelamentos e remarcações ainda está em preparação. No iPhone, instale o aplicativo na tela de início para permitir notificações.</p>
      <DeviceControls publicKey={publicKey} support={session.support} />
    </section>
  </div>;
}
