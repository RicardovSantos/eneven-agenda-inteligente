import type { Metadata } from "next";
import Link from "next/link";
import { requirePanelRole } from "@/server/panel/roles";
import { getDb } from "@/db/client";
import { listPushDevices } from "@/server/push/subscriptions";
import { removeSavedDevice } from "./actions";
import { DeviceControls } from "./device-controls";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificacoesPage() {
  const { session } = await requirePanelRole(["owner"]);
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY || null;
  const devices = session.support ? [] : await listPushDevices(await getDb(), session);
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
    <Link href="/painel/configuracoes" className="text-sm text-primary">‹ Configurações</Link>
    <div><h1 className="text-[1.75rem] font-semibold">Notificações</h1><p className="text-ink-muted">Cadastre este dispositivo para receber avisos da agenda.</p></div>
    <section className="space-y-4 rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Avisos neste dispositivo</h2>
      <p className="text-sm text-ink-muted">O envio de avisos sobre agendamentos, cancelamentos e remarcações ainda está em preparação. No iPhone, instale o aplicativo na tela de início para permitir notificações.</p>
      <DeviceControls publicKey={publicKey} support={session.support} />
    </section>
    {!session.support && <section className="space-y-4 rounded-card border border-line bg-surface p-5">
      <h2 className="font-semibold">Dispositivos cadastrados</h2>
      <p className="text-sm text-ink-muted">Remova um dispositivo antigo para ele deixar de receber avisos quando o envio estiver disponível.</p>
      {devices.length === 0 ? <p className="text-sm text-ink-muted">Nenhum dispositivo cadastrado.</p> : <ul className="divide-y divide-line">{devices.map((device, index) => <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span>Dispositivo {index + 1} <span className="text-sm text-ink-muted">· cadastrado em {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(device.createdAt)}</span></span><form action={removeSavedDevice}><input type="hidden" name="deviceId" value={device.id} /><button type="submit" className="min-h-11 rounded-field border border-line px-3 text-sm font-semibold">Remover</button></form></li>)}</ul>}
    </section>}
  </div>;
}
