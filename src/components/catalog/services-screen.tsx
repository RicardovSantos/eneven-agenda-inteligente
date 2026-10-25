"use client";

import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  archiveServiceAction,
  restoreServiceAction,
  saveServiceAction,
} from "@/app/painel/servicos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { centsFromDigits, formatBRL, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CatalogLayout,
  ColorDot,
  ConfirmDialog,
  EditPanel,
  EmptyState,
  FieldError,
  ProChip,
  StatusBadge,
} from "./parts";

export type ServiceItem = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  bufferAfterMin: number;
  priceCents: number;
  visible: boolean;
  archived: boolean;
  professionalIds: string[];
};

export type ProfessionalOption = {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
};

const DURATIONS = Array.from({ length: 48 }, (_, i) => (i + 1) * 5); // 5 a 240 min
const BUFFERS = [0, 5, 10, 15, 20, 30, 45, 60];

type Selection = { kind: "new" } | { kind: "edit"; id: string } | null;

export function ServicesScreen({
  services,
  professionals,
  canEdit,
}: {
  services: ServiceItem[];
  professionals: ProfessionalOption[];
  canEdit: boolean;
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<ServiceItem | null>(null);
  const [pending, startTransition] = useTransition();
  const { show } = useToast();

  const archivedCount = services.filter((s) => s.archived).length;
  const rows = useMemo(
    () => services.filter((s) => showArchived || !s.archived),
    [services, showArchived],
  );
  const byId = useMemo(() => new Map(professionals.map((p) => [p.id, p])), [professionals]);
  const selectedId = selection?.kind === "edit" ? selection.id : null;
  const editing = selection?.kind === "edit" ? services.find((s) => s.id === selection.id) : undefined;

  const confirmArchive = () => {
    const target = archiving;
    if (!target) return;
    startTransition(async () => {
      const result = await archiveServiceAction(target.id);
      show(result.error ?? result.message ?? "Serviço arquivado", result.ok ? "success" : "error");
      setArchiving(null);
      if (result.ok && selectedId === target.id) setSelection(null);
    });
  };

  const restore = (service: ServiceItem) =>
    startTransition(async () => {
      const result = await restoreServiceAction(service.id);
      show(result.error ?? result.message ?? "Serviço restaurado", result.ok ? "success" : "error");
    });

  const list = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <h1 className="text-[1.75rem] font-semibold">Serviços</h1>
          <p className="text-sm text-ink-muted">
            O que aparece na sua página de agendamento, com duração e preço.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setSelection({ kind: "new" })} className="shrink-0 px-[18px]">
            <Plus className="size-[18px]" aria-hidden="true" />
            Novo serviço
          </Button>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="rounded-field bg-primary-soft px-4 py-3 text-sm leading-snug text-primary">
          Só o proprietário pode alterar os serviços. Você pode consultar a lista.
        </p>
      ) : null}

      {services.length === 0 ? (
        <EmptyState
          title="Você ainda não tem serviços"
          text={
            canEdit
              ? "Cadastre o primeiro serviço para seus clientes poderem agendar."
              : "Quando o proprietário cadastrar os serviços, eles aparecem aqui."
          }
          action={
            canEdit ? (
              <Button onClick={() => setSelection({ kind: "new" })}>
                <Plus aria-hidden="true" />
                Novo serviço
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {archivedCount > 0 ? (
            <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="size-[18px] accent-primary"
              />
              Mostrar arquivados ({archivedCount})
            </label>
          ) : null}

          {/* Tabela (computador) */}
          <div className="hidden overflow-x-auto rounded-panel border border-line bg-surface lg:block">
            <table className="w-full min-w-[560px] border-collapse text-[0.9375rem]">
              <thead>
                <tr className="text-left text-[0.8125rem] text-ink-muted">
                  <th scope="col" className="border-b border-line px-5 py-3.5 font-semibold">Serviço</th>
                  <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Duração</th>
                  <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Preço</th>
                  <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Quem faz</th>
                  <th scope="col" className="border-b border-line px-5 py-3.5 whitespace-nowrap font-semibold">Na página</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelection({ kind: "edit", id: s.id })}
                    className={cn(
                      "cursor-pointer hover:bg-primary-soft/40",
                      selectedId === s.id && "bg-primary-soft/60 shadow-[inset_3px_0_0_var(--primary)]",
                      s.archived && "text-ink-muted",
                    )}
                  >
                    <td className="border-b border-line/60 px-5 py-3.5 font-semibold">
                      <button
                        type="button"
                        aria-pressed={selectedId === s.id}
                        className="text-left font-semibold outline-none focus-visible:underline"
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="border-b border-line/60 px-3 py-3.5 whitespace-nowrap tabular-nums">
                      {formatDuration(s.durationMin)}
                    </td>
                    <td className="border-b border-line/60 px-3 py-3.5 whitespace-nowrap tabular-nums">
                      {formatBRL(s.priceCents)}
                    </td>
                    <td className="border-b border-line/60 px-3 py-3.5">
                      <WhoDoes ids={s.professionalIds} byId={byId} />
                    </td>
                    <td className="border-b border-line/60 px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <VisibilityBadge service={s} />
                        {s.archived && canEdit ? (
                          <RestoreButton onClick={() => restore(s)} disabled={pending} name={s.name} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lista (celular) */}
          <ul className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface lg:hidden">
            {rows.map((s) => (
              <li key={s.id} className="border-b border-line/60 last:border-b-0">
                <div className="flex items-center gap-2 pr-3">
                  <button
                    type="button"
                    onClick={() => setSelection({ kind: "edit", id: s.id })}
                    className={cn(
                      "flex min-h-[4.5rem] min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3 text-left",
                      s.archived && "text-ink-muted",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{s.name}</span>
                      <span className="shrink-0 text-sm tabular-nums">{formatBRL(s.priceCents)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                      <span className="tabular-nums">{formatDuration(s.durationMin)}</span>
                      <WhoDoes ids={s.professionalIds} byId={byId} compact />
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <VisibilityBadge service={s} />
                    {s.archived && canEdit ? (
                      <RestoreButton onClick={() => restore(s)} disabled={pending} name={s.name} />
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );

  const panel = selection ? (
    <EditPanel
      title={selection.kind === "new" ? "Novo serviço" : "Editar serviço"}
      titleId="titulo-editar"
      onClose={() => setSelection(null)}
    >
      {selection.kind === "edit" && !editing ? (
        <p className="text-sm text-ink-muted">Este serviço não existe mais.</p>
      ) : (
        <ServiceForm
          key={selection.kind === "new" ? "new" : selection.id}
          service={editing}
          professionals={professionals}
          canEdit={canEdit}
          onDone={(created) => {
            if (created) setSelection(null);
          }}
          onClose={() => setSelection(null)}
          onArchive={editing && !editing.archived ? () => setArchiving(editing) : undefined}
        />
      )}
    </EditPanel>
  ) : null;

  return (
    <>
      <CatalogLayout list={list} panel={panel} />
      <ConfirmDialog
        open={archiving !== null}
        title={`Arquivar ${archiving?.name ?? ""}?`}
        confirmLabel="Arquivar"
        pending={pending}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      >
        Ele sai da sua página e da agenda. Agendamentos já feitos continuam com os dados atuais.
      </ConfirmDialog>
    </>
  );
}

function VisibilityBadge({ service }: { service: ServiceItem }) {
  if (service.archived) return <StatusBadge tone="off">Arquivado</StatusBadge>;
  return service.visible ? (
    <StatusBadge tone="on">Visível</StatusBadge>
  ) : (
    <StatusBadge tone="off">Oculto</StatusBadge>
  );
}

function RestoreButton({
  onClick,
  disabled,
  name,
}: {
  onClick: () => void;
  disabled: boolean;
  name: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={`Restaurar ${name}`}
      className="min-h-9 rounded-field px-2 text-sm font-semibold text-primary hover:bg-primary-soft disabled:opacity-50"
    >
      Restaurar
    </button>
  );
}

function WhoDoes({
  ids,
  byId,
  compact,
}: {
  ids: string[];
  byId: Map<string, ProfessionalOption>;
  compact?: boolean;
}) {
  const pros = ids.map((id) => byId.get(id)).filter((p): p is ProfessionalOption => !!p);
  if (pros.length === 0) {
    return <span className="text-[0.8125rem] font-medium text-danger">Sem profissional</span>;
  }
  if (compact) {
    return (
      <span className="flex items-center gap-1.5">
        {pros.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1">
            <ColorDot color={p.color} size={7} />
            {p.name}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {pros.map((p) => (
        <ProChip key={p.id} name={p.name} color={p.color} />
      ))}
    </span>
  );
}

function withCurrent(options: number[], current: number | undefined) {
  return current === undefined || options.includes(current)
    ? options
    : [...options, current].sort((a, b) => a - b);
}

function ServiceForm({
  service,
  professionals,
  canEdit,
  onDone,
  onClose,
  onArchive,
}: {
  service?: ServiceItem;
  professionals: ProfessionalOption[];
  canEdit: boolean;
  /** `created` = true quando acabou de criar um serviço novo. */
  onDone: (created: boolean) => void;
  onClose: () => void;
  onArchive?: () => void;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [durationMin, setDurationMin] = useState(service?.durationMin ?? 30);
  const [priceCents, setPriceCents] = useState(service?.priceCents ?? 0);
  const [bufferAfterMin, setBufferAfterMin] = useState(service?.bufferAfterMin ?? 0);
  const [professionalIds, setProfessionalIds] = useState<string[]>(
    service?.professionalIds ?? professionals.filter((p) => p.active).map((p) => p.id),
  );
  const [visible, setVisible] = useState(service?.visible ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Ativos, mais os inativos que já fazem este serviço (para poder desmarcar).
  const shown = professionals.filter((p) => p.active || professionalIds.includes(p.id));
  const archived = service?.archived === true;
  const readOnly = !canEdit || archived;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    startTransition(async () => {
      const result = await saveServiceAction({
        id: service?.id,
        name,
        description,
        durationMin,
        bufferAfterMin,
        priceCents,
        visible,
        professionalIds,
      });
      setErrors(result.fieldErrors ?? {});
      if (result.ok) {
        show(result.message ?? "Serviço salvo");
        onDone(service === undefined);
      } else {
        show(result.error ?? "Não foi possível salvar agora.", "error");
      }
    });
  };

  const toggle = (id: string, on: boolean) =>
    setProfessionalIds((current) => (on ? [...current, id] : current.filter((x) => x !== id)));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <fieldset disabled={readOnly || pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-nome" className="font-semibold">Nome</Label>
          <Input
            id="s-nome"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "s-nome-erro" : undefined}
            className="h-11"
          />
          <FieldError id="s-nome-erro">{errors.name}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-desc" className="font-semibold">
            Descrição <span className="font-normal text-ink-muted">(opcional)</span>
          </Label>
          <Textarea
            id="s-desc"
            rows={2}
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={errors.description ? true : undefined}
            className="min-h-[4.25rem] resize-none"
          />
          <FieldError>{errors.description}</FieldError>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="s-dur" className="font-semibold">Duração</Label>
            <Select
              id="s-dur"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              aria-invalid={errors.durationMin ? true : undefined}
            >
              {withCurrent(DURATIONS, service?.durationMin).map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m)}
                </option>
              ))}
            </Select>
            <FieldError>{errors.durationMin}</FieldError>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="s-preco" className="font-semibold">Preço</Label>
            <Input
              id="s-preco"
              inputMode="numeric"
              autoComplete="off"
              value={formatBRL(priceCents)}
              onChange={(e) => setPriceCents(centsFromDigits(e.target.value))}
              aria-invalid={errors.priceCents ? true : undefined}
              className="h-11 tabular-nums"
            />
            <FieldError>{errors.priceCents}</FieldError>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-int" className="font-semibold">Intervalo depois do atendimento</Label>
          <Select
            id="s-int"
            value={bufferAfterMin}
            onChange={(e) => setBufferAfterMin(Number(e.target.value))}
            aria-invalid={errors.bufferAfterMin ? true : undefined}
          >
            {withCurrent(BUFFERS, service?.bufferAfterMin).map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "Sem intervalo" : `${m} min`}
              </option>
            ))}
          </Select>
          <span className="text-[0.8125rem] text-ink-muted">
            Esse tempo fica bloqueado na agenda, mas o cliente não vê.
          </span>
          <FieldError>{errors.bufferAfterMin}</FieldError>
        </div>

        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-semibold">Quem faz este serviço</legend>
          {shown.length === 0 ? (
            <p className="rounded-field bg-primary-soft px-4 py-3 text-sm leading-snug text-primary">
              Cadastre um profissional na{" "}
              <Link href="/painel/equipe" className="font-semibold underline">
                Equipe
              </Link>{" "}
              para oferecer este serviço.
            </p>
          ) : (
            shown.map((p) => (
              <label
                key={p.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-field border border-line px-3"
              >
                <input
                  type="checkbox"
                  checked={professionalIds.includes(p.id)}
                  onChange={(e) => toggle(p.id, e.target.checked)}
                  className="size-[18px] accent-primary"
                />
                <ColorDot color={p.color} />
                <span className="min-w-0 truncate">{p.name}</span>
                {!p.active ? <span className="text-[0.8125rem] text-ink-muted">inativo</span> : null}
              </label>
            ))
          )}
          {shown.length > 0 && professionalIds.length === 0 ? (
            <p className="text-[0.8125rem] leading-snug text-danger">
              Sem profissional, este serviço não aparece na página de agendamento.
            </p>
          ) : null}
          <FieldError>{errors.professionalIds}</FieldError>
        </fieldset>

        <div className="flex min-h-11 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">
              Mostrar na página de agendamento
            </span>
            <span className="text-[0.8125rem] text-ink-muted">
              Desligado, só a equipe consegue agendar.
            </span>
          </div>
          <Switch
            checked={visible}
            onCheckedChange={setVisible}
            label="Mostrar na página de agendamento"
            disabled={readOnly || pending}
          />
        </div>
      </fieldset>

      {archived ? (
        <p className="rounded-field bg-primary-soft px-4 py-3 text-sm leading-snug text-primary">
          Este serviço está arquivado. Restaure para voltar a editar e oferecer.
        </p>
      ) : null}
      {!canEdit ? (
        <p className="text-sm text-ink-muted">Só o proprietário pode alterar este serviço.</p>
      ) : null}

      {canEdit && !archived ? (
        <div className="flex gap-2.5 pt-1">
          <Button type="submit" disabled={pending} className="h-[46px] flex-1">
            {pending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Salvando…
              </>
            ) : (
              "Salvar alterações"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="h-[46px] px-[18px]">
            Cancelar
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={onClose} className="h-[46px] lg:hidden">
          Voltar
        </Button>
      )}

      {onArchive && canEdit ? (
        <button
          type="button"
          onClick={onArchive}
          className="min-h-11 w-fit rounded-field px-2 text-sm font-semibold text-[#C2410C] hover:bg-danger-soft dark:text-danger"
        >
          Arquivar serviço
        </button>
      ) : null}
    </form>
  );
}
