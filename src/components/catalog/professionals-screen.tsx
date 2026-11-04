"use client";

import { Check, KeyRound, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  deactivateProfessionalAction,
  removeProfessionalAction,
  removeProfessionalPhotoAction,
  saveProfessionalAction,
  uploadProfessionalPhotoAction,
} from "@/app/painel/equipe/actions";
import { PhotoField, type PhotoResult } from "@/components/media/photo-field";
import { PersonAvatar } from "@/components/media/person-avatar";
import { WeeklyHoursEditor } from "@/components/hours/weekly-hours-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { summarizeWeek } from "@/lib/hours-summary";
import { PROFESSIONAL_COLORS, nextProfessionalColor } from "@/lib/professional-colors";
import { cn } from "@/lib/utils";
import {
  outsideBusinessHours,
  validateWeeklyHours,
  type WeeklyHours,
} from "@/lib/weekly-hours";
import {
  CatalogLayout,
  ConfirmDialog,
  EditPanel,
  EmptyState,
  FieldError,
  StatusBadge,
} from "./parts";

export type ProfessionalItem = {
  id: string;
  name: string;
  /** Cargo mostrado na página pública. */
  title: string | null;
  /** Endereço público da foto ou `null`. */
  photoUrl: string | null;
  color: string | null;
  active: boolean;
  serviceIds: string[];
  hours: WeeklyHours;
  futureBookings: number;
  /** Ligado a um usuário (tem acesso ao painel). */
  hasAccess?: boolean;
};

export type ServiceOption = { id: string; name: string };

type Selection = { kind: "new" } | { kind: "edit"; id: string } | null;

export function ProfessionalsScreen({
  professionals,
  services,
  businessHours,
  canEdit,
}: {
  professionals: ProfessionalItem[];
  services: ServiceOption[];
  businessHours: WeeklyHours;
  canEdit: boolean;
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const [deactivating, setDeactivating] = useState<ProfessionalItem | null>(null);
  const [removing, setRemoving] = useState<ProfessionalItem | null>(null);
  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");
  const [pending, startTransition] = useTransition();
  const { show } = useToast();

  const serviceName = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);
  const selectedId = selection?.kind === "edit" ? selection.id : null;
  const editing =
    selection?.kind === "edit" ? professionals.find((p) => p.id === selection.id) : undefined;

  const confirmDeactivate = () => {
    const target = deactivating;
    if (!target) return;
    startTransition(async () => {
      const result = await deactivateProfessionalAction(target.id, target.futureBookings > 0);
      show(result.fieldErrors?.deactivate ?? result.error ?? result.message ?? "Profissional desativado", result.ok ? "success" : "error");
      setDeactivating(null);
    });
  };

  const confirmRemove = () => {
    const target = removing;
    if (!target) return;
    startTransition(async () => {
      const result = await removeProfessionalAction(target.id, target.futureBookings > 0);
      show(
        result.ok ? (result.message ?? "Profissional removido") : (result.fieldErrors?.remove ?? result.error ?? "Não foi possível remover agora."),
        result.ok ? "success" : "error",
      );
      setRemoving(null);
      if (result.ok) setSelection(null);
    });
  };

  const inactiveCount = professionals.filter((p) => !p.active).length;
  const visible = professionals.filter((p) =>
    filter === "all" ? true : filter === "active" ? p.active : !p.active,
  );
  const filters = [
    { key: "active", label: "Ativos" },
    { key: "inactive", label: `Inativos${inactiveCount > 0 ? ` (${inactiveCount})` : ""}` },
    { key: "all", label: "Todos" },
  ] as const;

  const list = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <h1 className="text-[1.75rem] font-semibold">Equipe</h1>
          <p className="text-sm text-ink-muted">
            Quem atende, o que cada pessoa faz e em quais horários.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setSelection({ kind: "new" })} className="shrink-0 px-[18px]">
            <Plus className="size-[18px]" aria-hidden="true" />
            Novo profissional
          </Button>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="rounded-field bg-primary-soft px-4 py-3 text-sm leading-snug text-primary">
          Só o proprietário pode alterar a equipe. Você pode consultar a lista.
        </p>
      ) : null}

      {professionals.length === 0 ? (
        <EmptyState
          title="Você ainda não tem profissionais"
          text={
            canEdit
              ? "Cadastre quem atende para os clientes poderem escolher um horário."
              : "Quando o proprietário cadastrar a equipe, ela aparece aqui."
          }
          action={
            canEdit ? (
              <Button onClick={() => setSelection({ kind: "new" })}>
                <Plus aria-hidden="true" />
                Novo profissional
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div role="group" aria-label="Filtrar equipe" className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "min-h-9 rounded-full border px-3.5 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-accent",
                  filter === f.key
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-line text-ink-muted hover:bg-primary-soft/40",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="rounded-panel border border-line bg-surface px-5 py-6 text-sm text-ink-muted">
              {filter === "inactive" ? "Nenhum profissional inativo." : "Nenhum profissional ativo."}
            </p>
          ) : null}
          {/* Tabela (computador) */}
          <div className="hidden overflow-x-auto rounded-panel border border-line bg-surface lg:block">
            <table className="w-full min-w-[480px] border-collapse text-[0.9375rem]">
              <thead>
                <tr className="text-left text-[0.8125rem] text-ink-muted">
                  <th scope="col" className="border-b border-line px-5 py-3.5 font-semibold">Profissional</th>
                  <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Serviços que faz</th>
                  <th scope="col" className="border-b border-line px-3 py-3.5 font-semibold">Horário</th>
                  <th scope="col" className="border-b border-line px-5 py-3.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelection({ kind: "edit", id: p.id })}
                    className={cn(
                      "cursor-pointer hover:bg-primary-soft/40",
                      selectedId === p.id && "bg-primary-soft/60 shadow-[inset_3px_0_0_var(--primary)]",
                      !p.active && "text-ink-muted",
                    )}
                  >
                    <td className="border-b border-line/60 px-5 py-3.5">
                      <button
                        type="button"
                        aria-pressed={selectedId === p.id}
                        className="flex items-center gap-2.5 text-left font-semibold outline-none focus-visible:underline"
                      >
                        <PersonAvatar name={p.name} color={p.color} photoUrl={p.photoUrl} size={36} />
                        {p.name}
                        {p.hasAccess ? <AccessTag /> : null}
                      </button>
                    </td>
                    <td className="border-b border-line/60 px-3 py-3.5">
                      <ServiceChips ids={p.serviceIds} names={serviceName} />
                    </td>
                    <td className="border-b border-line/60 px-3 py-3.5 text-[0.8125rem] whitespace-nowrap">
                      {summarizeWeek(p.hours)}
                    </td>
                    <td className="border-b border-line/60 px-5 py-3.5">
                      <StatusBadge tone={p.active ? "on" : "off"}>
                        {p.active ? "Ativo" : "Inativo"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lista (celular) */}
          <ul className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface lg:hidden">
            {visible.map((p) => (
              <li key={p.id} className="border-b border-line/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSelection({ kind: "edit", id: p.id })}
                  className={cn(
                    "flex min-h-[4.5rem] w-full flex-col justify-center gap-1 px-4 py-3 text-left",
                    !p.active && "text-ink-muted",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2.5 font-semibold">
                      <PersonAvatar name={p.name} color={p.color} photoUrl={p.photoUrl} size={40} />
                      <span className="truncate">{p.name}</span>
                      {p.hasAccess ? <AccessTag /> : null}
                    </span>
                    <StatusBadge tone={p.active ? "on" : "off"}>
                      {p.active ? "Ativo" : "Inativo"}
                    </StatusBadge>
                  </span>
                  <span className="text-sm text-ink-muted">{summarizeWeek(p.hours)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );

  const panel = selection ? (
    <EditPanel
      title={selection.kind === "new" ? "Novo profissional" : "Editar profissional"}
      titleId="titulo-editar"
      widthClass="lg:w-[440px]"
      onClose={() => setSelection(null)}
    >
      {selection.kind === "edit" && !editing ? (
        <p className="text-sm text-ink-muted">Este profissional não existe mais.</p>
      ) : (
        <ProfessionalForm
          key={selection.kind === "new" ? "new" : `${selection.id}-${editing?.active}`}
          professional={editing}
          professionals={professionals}
          services={services}
          businessHours={businessHours}
          canEdit={canEdit}
          onDone={(created) => {
            if (created) setSelection(null);
          }}
          onClose={() => setSelection(null)}
          onDeactivate={() => editing && setDeactivating(editing)}
          onRemove={() => editing && setRemoving(editing)}
        />
      )}
    </EditPanel>
  ) : null;

  const n = deactivating?.futureBookings ?? 0;
  return (
    <>
      <CatalogLayout list={list} panel={panel} />
      <ConfirmDialog
        open={deactivating !== null}
        title={`Desativar ${deactivating?.name ?? ""}?`}
        confirmLabel={n > 0 ? (n === 1 ? "Cancelar 1 agendamento e desativar" : `Cancelar ${n} agendamentos e desativar`) : "Desativar"}
        pending={pending}
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivating(null)}
      >
        <p>Ele deixa de aparecer na sua página e não recebe novos agendamentos.</p>
        {n > 0 ? (
          <p className="mt-2 font-medium text-foreground">
            {n === 1
              ? `${deactivating?.name} tem 1 agendamento futuro.`
              : `${deactivating?.name} tem ${n} agendamentos futuros.`}{" "}
            Para desativar, {n === 1 ? "ele será cancelado" : "todos serão cancelados"} e {n === 1 ? "o cliente é avisado" : "os clientes são avisados"} pelo WhatsApp, conforme suas preferências de mensagens. Se preferir, volte e remarque pela agenda.
          </p>
        ) : null}
        {deactivating?.hasAccess ? (
          <p className="mt-2 font-medium text-foreground">
            O acesso dele ao painel também é cancelado. Para voltar a entrar, será preciso um novo convite.
          </p>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={removing !== null}
        titleId="remover-titulo"
        title={`Remover ${removing?.name ?? ""} da equipe?`}
        confirmLabel={(removing?.futureBookings ?? 0) > 0 ? `Cancelar ${removing?.futureBookings} e remover` : "Remover"}
        pending={pending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      >
        <p>Ela sai da lista da equipe e da sua página. O histórico de agendamentos dela continua nos relatórios.</p>
        {(removing?.futureBookings ?? 0) > 0 ? (
          <p className="mt-2 font-medium text-foreground">
            Há {removing?.futureBookings} {removing?.futureBookings === 1 ? "agendamento futuro" : "agendamentos futuros"} com essa pessoa. Para remover, {removing?.futureBookings === 1 ? "ele será cancelado" : "todos serão cancelados"} e os clientes são avisados pelo WhatsApp, conforme suas preferências de mensagens.
          </p>
        ) : null}
        {removing?.hasAccess ? (
          <p className="mt-2 font-medium text-foreground">O acesso dela ao painel também é cancelado.</p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

/** Pequeno aviso de que a pessoa entra no painel (profissional ligado a um usuário). */
function AccessTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
      <KeyRound className="size-3" aria-hidden="true" />
      Tem acesso
    </span>
  );
}

function ServiceChips({ ids, names }: { ids: string[]; names: Map<string, string> }) {
  const list = ids.map((id) => names.get(id)).filter((n): n is string => !!n);
  if (list.length === 0) {
    return <span className="text-[0.8125rem] font-medium text-danger">Nenhum serviço</span>;
  }
  const visible = list.slice(0, 1);
  const rest = list.length - visible.length;
  return (
    <span className="flex flex-nowrap gap-1.5" title={list.join(", ")}>
      {visible.map((name) => (
        <span
          key={name}
          className="inline-flex whitespace-nowrap rounded-full bg-canvas px-2.5 py-1 text-[0.8125rem] font-medium"
        >
          {name}
        </span>
      ))}
      {rest > 0 ? (
        <span className="inline-flex rounded-full bg-canvas px-2.5 py-1 text-[0.8125rem] font-medium text-ink-muted">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

function ProfessionalForm({
  professional,
  professionals,
  services,
  businessHours,
  canEdit,
  onDone,
  onClose,
  onDeactivate,
  onRemove,
}: {
  professional?: ProfessionalItem;
  professionals: ProfessionalItem[];
  services: ServiceOption[];
  businessHours: WeeklyHours;
  canEdit: boolean;
  onDone: (created: boolean) => void;
  onClose: () => void;
  onDeactivate: () => void;
  onRemove: () => void;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const isNew = professional === undefined;
  const [name, setName] = useState(professional?.name ?? "");
  const [title, setTitle] = useState(professional?.title ?? "");
  // Profissional novo ainda não tem id: a foto escolhida espera o "Salvar" para ser enviada.
  const [pendingFile, setPendingPhotoState] = useState<{ file: File; url: string } | null>(null);
  const pendingPhoto = pendingFile?.file ?? null;
  const pendingPreview = pendingFile?.url ?? null;
  const setPendingPhoto = (file: File | null) =>
    setPendingPhotoState(file ? { file, url: URL.createObjectURL(file) } : null);
  useEffect(() => {
    const url = pendingFile?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pendingFile?.url]);
  // Novo: primeira cor livre, expediente igual ao do estabelecimento, faz todos os serviços.
  const [color, setColor] = useState(
    professional?.color ?? nextProfessionalColor(professionals.map((p) => p.color)),
  );
  const [serviceIds, setServiceIds] = useState<string[]>(
    professional?.serviceIds ?? services.map((s) => s.id),
  );
  const [hours, setHours] = useState<WeeklyHours>(professional?.hours ?? businessHours);
  const [active, setActive] = useState(professional?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const outside = outsideBusinessHours(hours, businessHours);
  const invalid =
    Object.keys(validateWeeklyHours(hours)).length > 0 || Object.keys(outside).length > 0;
  const readOnly = !canEdit;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly || invalid) return;
    startTransition(async () => {
      const result = await saveProfessionalAction({
        id: professional?.id,
        name,
        title,
        color,
        active,
        serviceIds,
        hours,
      });
      setErrors(result.fieldErrors ?? {});
      if (result.ok) {
        if (pendingPhoto && result.id) {
          const data = new FormData();
          data.set("id", result.id);
          data.set("photo", pendingPhoto);
          const photo = await uploadProfessionalPhotoAction(data);
          if (!photo.ok) show(photo.error ?? "O profissional foi salvo, mas a foto não foi enviada.", "error");
        }
        show(result.message ?? "Profissional salvo");
        onDone(isNew);
      } else {
        show(result.error ?? "Não foi possível salvar agora.", "error");
      }
    });
  };

  const onActiveChange = (next: boolean) => {
    // Desativar quem já está ativo pede confirmação (e avisa dos agendamentos futuros).
    if (!next && professional?.active) onDeactivate();
    else setActive(next);
  };

  const toggleService = (id: string, on: boolean) =>
    setServiceIds((current) => (on ? [...current, id] : current.filter((x) => x !== id)));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <fieldset disabled={readOnly || pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-nome" className="font-semibold">Nome</Label>
          <Input
            id="p-nome"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            className="h-11"
          />
          <FieldError>{errors.name}</FieldError>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-cargo" className="font-semibold">Cargo (opcional)</Label>
          <Input
            id="p-cargo"
            value={title}
            maxLength={40}
            placeholder="Ex.: Barbeiro, Cabeleireira"
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={errors.title ? true : undefined}
            className="h-11"
          />
          <FieldError>{errors.title}</FieldError>
        </div>

        <PhotoField
          label="Foto"
          hint="Aparece na página de agendamento, em formato redondo. Qualquer formato de imagem."
          shape="round"
          maxSide={640}
          currentUrl={professional ? professional.photoUrl : pendingPreview}
          placeholder={<span aria-hidden="true" className="text-2xl font-semibold">{(name.trim()[0] ?? "?").toUpperCase()}</span>}
          disabled={readOnly}
          onUpload={async (file): Promise<PhotoResult> => {
            if (!professional) {
              setPendingPhoto(file);
              return { ok: true };
            }
            const data = new FormData();
            data.set("id", professional.id);
            data.set("photo", file);
            const result = await uploadProfessionalPhotoAction(data);
            if (result.ok) show(result.message ?? "Foto atualizada");
            return { ok: result.ok, error: result.fieldErrors?.photo ?? result.error };
          }}
          onRemove={
            professional?.photoUrl || pendingPhoto
              ? async (): Promise<PhotoResult> => {
                  if (!professional) {
                    setPendingPhoto(null);
                    return { ok: true };
                  }
                  const result = await removeProfessionalPhotoAction(professional.id);
                  if (result.ok) show(result.message ?? "Foto removida");
                  return { ok: result.ok, error: result.error };
                }
              : undefined
          }
        />

        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold">Cor</legend>
          <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-0">
            {PROFESSIONAL_COLORS.map((c) => {
              const selected = c === color.toUpperCase();
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Cor ${c}`}
                  onClick={() => setColor(c)}
                  className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-white",
                      selected && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
                    )}
                    style={{ backgroundColor: c }}
                  >
                    {selected ? <Check className="size-4" aria-hidden="true" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <FieldError>{errors.color}</FieldError>
        </fieldset>

        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-semibold">Serviços que faz</legend>
          {services.length === 0 ? (
            <p className="rounded-field bg-primary-soft px-4 py-3 text-sm leading-snug text-primary">
              Cadastre serviços em{" "}
              <Link href="/painel/servicos" className="font-semibold underline">
                Serviços
              </Link>{" "}
              para escolher o que esta pessoa faz.
            </p>
          ) : (
            services.map((s) => (
              <label
                key={s.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-field border border-line px-3"
              >
                <input
                  type="checkbox"
                  checked={serviceIds.includes(s.id)}
                  onChange={(e) => toggleService(s.id, e.target.checked)}
                  className="size-[18px] accent-primary"
                />
                <span className="min-w-0 truncate">{s.name}</span>
              </label>
            ))
          )}
          <FieldError>{errors.serviceIds}</FieldError>
        </fieldset>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Horário de trabalho</h3>
          <WeeklyHoursEditor
            value={hours}
            onChange={setHours}
            toggleLabel="Trabalha"
            idPrefix="pro"
            dayErrors={outside}
            disabled={readOnly || pending}
          />
          <FieldError>{errors.hours && Object.keys(outside).length === 0 ? errors.hours : undefined}</FieldError>
        </div>

        <div className="flex min-h-11 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">Ativo</span>
            <span className="text-[0.8125rem] text-ink-muted">
              Desligado, a pessoa não recebe novos agendamentos.
            </span>
          </div>
          <Switch
            checked={active}
            onCheckedChange={onActiveChange}
            label="Ativo"
            disabled={readOnly || pending}
          />
        </div>
      </fieldset>

      {!canEdit ? (
        <p className="text-sm text-ink-muted">Só o proprietário pode alterar a equipe.</p>
      ) : null}

      {canEdit && professional ? (
        <button
          type="button"
          onClick={onRemove}
          className="self-start text-sm font-semibold text-danger underline-offset-2 outline-none hover:underline focus-visible:underline"
        >
          Remover da equipe
        </button>
      ) : null}

      {canEdit ? (
        <div className="flex gap-2.5 pt-1">
          <Button type="submit" disabled={pending || invalid} className="h-[46px] flex-1">
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
    </form>
  );
}
