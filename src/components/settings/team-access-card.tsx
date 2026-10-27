"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import {
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  type TeamActionState,
} from "@/app/painel/configuracoes/actions";
import { ConfirmDialog, StatusBadge } from "@/components/catalog/parts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { InviteDialog, type InvitableProfessional } from "./invite-dialog";
import { SettingsSection } from "./settings-section";

export type TeamMemberItem =
  | {
      kind: "member";
      userId: string;
      name: string;
      email: string;
      role: "owner" | "reception" | "staff";
      professionalName: string | null;
    }
  | {
      kind: "invite";
      invitationId: string;
      name: string;
      email: string;
      role: "reception" | "staff";
      professionalName: string | null;
      expired: boolean;
    };

type MemberItem = Extract<TeamMemberItem, { kind: "member" }>;

function roleLabel(item: TeamMemberItem): string {
  if (item.role === "owner") return "Proprietário";
  if (item.role === "reception") return "Recepção";
  return item.professionalName ? `Profissional · ${item.professionalName}` : "Profissional";
}

export function TeamAccessCard({
  members,
  professionals,
}: {
  members: TeamMemberItem[];
  professionals: InvitableProfessional[];
}) {
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<MemberItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { show } = useToast();

  const finish = (result: TeamActionState, fallback: string) => {
    if (!result.ok) {
      show(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? fallback, "error");
    } else {
      show(result.message ?? fallback, result.emailSent === false ? "error" : "success");
    }
  };

  const run = (id: string, work: () => Promise<TeamActionState>, fallback: string) => {
    setBusyId(id);
    startTransition(async () => {
      try {
        finish(await work(), fallback);
      } finally {
        setBusyId(null);
      }
    });
  };

  const confirmRemove = () => {
    const target = removing;
    if (!target) return;
    startTransition(async () => {
      finish(await removeMemberAction(target.userId), "Acesso removido");
      setRemoving(null);
    });
  };

  return (
    <SettingsSection
      id="acessos"
      title="Acessos da equipe"
      description="Quem pode entrar no painel deste estabelecimento e o que cada pessoa vê."
    >
      <ul className="flex flex-col divide-y divide-line/60 rounded-field border border-line">
        {members.map((item) => {
          const key = item.kind === "member" ? item.userId : item.invitationId;
          const busy = busyId === key;
          return (
            <li
              key={`${item.kind}-${key}`}
              className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="truncate font-semibold">{item.name}</span>
                  {item.kind === "member" ? (
                    <StatusBadge tone="on">Ativo</StatusBadge>
                  ) : (
                    <StatusBadge tone="off">
                      {item.expired ? "Convite vencido" : "Convite enviado"}
                    </StatusBadge>
                  )}
                </div>
                <span className="truncate text-sm text-ink-muted">{item.email}</span>
                <span className="text-sm">{roleLabel(item)}</span>
              </div>

              {item.kind === "invite" ? (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(key, () => resendInvitationAction(item.invitationId), "Convite reenviado")
                    }
                  >
                    {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                    Reenviar convite
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(key, () => revokeInvitationAction(item.invitationId), "Convite cancelado")
                    }
                  >
                    Cancelar convite
                  </Button>
                </div>
              ) : item.role !== "owner" ? (
                <div className="flex sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    className="max-sm:-ml-4"
                    onClick={() => setRemoving(item)}
                    aria-label={`Remover acesso de ${item.name}`}
                  >
                    Remover acesso
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex sm:justify-end">
        <Button type="button" onClick={() => setInviting(true)} className="w-full px-5 sm:w-auto">
          <UserPlus className="size-[18px]" aria-hidden="true" />
          Convidar pessoa
        </Button>
      </div>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} professionals={professionals} />

      <ConfirmDialog
        open={removing !== null}
        titleId="remove-access-title"
        title={`Remover o acesso de ${removing?.name ?? ""}?`}
        confirmLabel="Remover acesso"
        pending={pending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      >
        <p>{removing?.name ?? ""} não vai mais conseguir entrar no painel deste estabelecimento.</p>
      </ConfirmDialog>
    </SettingsSection>
  );
}
