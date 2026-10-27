"use client";

import { Loader2, Mail, MessageCircle } from "lucide-react";
import { useTransition } from "react";
import { sendOwnerInviteAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Props = {
  tenantId: string;
  owner: {
    name: string;
    email: string;
    emailVerified: boolean;
    /** Texto pronto ("(11) 99654-2210"); `null` quando o estabelecimento não tem WhatsApp. */
    whatsappLabel: string | null;
    lastSeen: string;
  } | null;
  /** Link do WhatsApp com a mensagem inicial, ou `null`. */
  whatsappUrl: string | null;
  /** O dono ainda não criou a senha: mostra "Enviar acesso por e-mail". */
  canSendAccess: boolean;
  /** "27/10" do último convite pendente, se houver. */
  inviteSentOn: string | null;
};

/** Cartão "Dono": dados de contato, WhatsApp e envio do acesso por e-mail. */
export function OwnerCard({ tenantId, owner, whatsappUrl, canSendAccess, inviteSentOn }: Props) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  const send = () =>
    startTransition(async () => {
      const result = await sendOwnerInviteAction(tenantId);
      show(result.ok ? result.message : result.error, result.ok ? "success" : "error");
    });

  return (
    <section
      aria-labelledby="t-dono"
      className="flex flex-col gap-3.5 rounded-panel border border-line bg-surface px-5 py-5 sm:px-6"
    >
      <h2 id="t-dono" className="font-display text-xl font-semibold">
        Dono
      </h2>
      {owner ? (
        <dl className="m-0 grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-y-2.5 text-[0.9375rem] sm:grid-cols-[140px_minmax(0,1fr)]">
          <dt className="text-ink-muted">Nome</dt>
          <dd className="m-0 font-semibold">{owner.name}</dd>
          <dt className="text-ink-muted">E-mail</dt>
          <dd className="m-0 break-words font-semibold">
            {owner.email}{" "}
            {owner.emailVerified ? (
              <span className="font-medium text-[#0B7A44] dark:text-[#3dd68c]">· confirmado</span>
            ) : (
              <span className="font-medium text-ink-muted">· não confirmado</span>
            )}
          </dd>
          <dt className="text-ink-muted">WhatsApp</dt>
          <dd className="m-0 font-semibold tabular-nums">{owner.whatsappLabel ?? "—"}</dd>
          <dt className="text-ink-muted">Último acesso</dt>
          <dd className="m-0 font-semibold tabular-nums">{owner.lastSeen}</dd>
        </dl>
      ) : (
        <p className="text-[0.9375rem] text-ink-muted">Este estabelecimento ainda não tem dono vinculado.</p>
      )}

      <div className="flex flex-col items-start gap-1">
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-10 items-center gap-2 text-[0.9375rem] font-semibold text-primary no-underline hover:underline"
          >
            <MessageCircle className="size-[18px]" aria-hidden="true" />
            Chamar no WhatsApp
          </a>
        ) : null}
      </div>

      {owner && canSendAccess ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/70 pt-3.5">
          <Button type="button" variant="outline" disabled={pending} onClick={send} className="gap-2 px-4 text-[0.9375rem]">
            {pending ? (
              <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
            ) : (
              <Mail className="size-[18px]" aria-hidden="true" />
            )}
            {inviteSentOn ? "Reenviar acesso por e-mail" : "Enviar acesso por e-mail"}
          </Button>
          {inviteSentOn ? (
            <span className="text-[0.8125rem] tabular-nums text-ink-muted">Convite enviado em {inviteSentOn}</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
