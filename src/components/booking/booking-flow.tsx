"use client";

import { ChevronDown, ChevronLeft, Loader2, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { bookAction, getDatesAction, getSlotsAction } from "@/app/[slug]/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { TextField } from "@/components/auth/text-field";
import { ProgressThread } from "@/components/brand/progress-thread";
import { formatLongDate } from "@/lib/dates";
import type { WeekRow } from "@/lib/week-rows";
import { formatBRL, formatDuration } from "@/lib/format";
import { formatBrazilPhone, normalizeBrazilPhone } from "@/lib/phone";
import { SLOT_TAKEN_MESSAGE } from "@/server/agenda/errors";
import type { BookingView } from "@/server/public/view";
import { Confirmation } from "./confirmation";
import { DEFAULT_HERO_SUBTITLE, DEFAULT_HERO_TITLE, HeroCarousel } from "./hero-carousel";
import {
  BrandMark,
  brandButton,
  CompactBrand,
  whatsappUrl,
  type BookingTenant,
} from "./shell";
import { SlotPicker, type PickedSlot } from "./slot-picker";
import { StudioInfo } from "./studio-info";
import { ProfessionalAvatar, TeamSection, type TeamMember } from "./team-section";

export type CatalogService = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  durationMin: number;
  priceCents: number;
  professionalIds: string[];
};
export type CatalogCategory = { id: string; name: string };
export type CatalogProfessional = { id: string; name: string; color: string | null };

/** O que a página inicial mostra além do catálogo (carrossel, equipe e informações do estúdio). */
export type PublicPageContent = {
  heroImages: string[];
  heroTitle: string | null;
  heroSubtitle: string | null;
  team: TeamMember[];
  weekRows: WeekRow[];
  instagram: string | null;
  facebook: string | null;
};

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Serviço", "Profissional", "Horário", "Seus dados"];
const CONSENT_MESSAGE = "Marque a caixa para concordar com o uso dos seus dados.";

type Form = { name: string; phone: string; email: string; consent: boolean };

/**
 * Fluxo de agendamento da página pública (passos 1 a 4 e confirmação), todo no
 * cliente: cada passo é uma tela, o botão Voltar do navegador volta um passo e
 * os horários vêm de server actions que resolvem o estabelecimento pelo slug.
 */
export function BookingFlow({
  tenant,
  services,
  categories,
  professionals,
  today,
  content,
  lockedProfessional,
}: {
  tenant: BookingTenant;
  services: CatalogService[];
  /** Grupos da lista de serviços (vazio: lista sem grupos). */
  categories: CatalogCategory[];
  professionals: CatalogProfessional[];
  /** Hoje no fuso do salão ("yyyy-MM-dd"), calculado no servidor. */
  today: string;
  content: PublicPageContent;
  /**
   * Página de um profissional (`/{slug}/profissional/{id}`): o profissional já
   * está escolhido, só aparecem os serviços dele e o passo seguinte é a data.
   */
  lockedProfessional?: TeamMember;
}) {
  const [step, setStep] = useState<Step>(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [professionalId, setProfessionalId] = useState<string>(lockedProfessional?.id ?? "any");
  const [query, setQuery] = useState("");
  // Só o primeiro grupo abre sozinho; os demais abrem no toque (todos abrem durante a busca).
  const [openGroups, setOpenGroups] = useState<string[]>(() => (categories[0] ? [categories[0].id] : []));
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<Form>({ name: "", phone: "", email: "", consent: false });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ token: string; booking: BookingView; firstName: string } | null>(null);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => services.find((s) => s.id === id))
        .filter((s): s is CatalogService => s !== undefined),
    [selectedIds, services],
  );
  const visibleServices = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return needle === ""
      ? services
      : services.filter(
          (s) =>
            s.name.toLocaleLowerCase("pt-BR").includes(needle) ||
            (s.description ?? "").toLocaleLowerCase("pt-BR").includes(needle),
        );
  }, [services, query]);
  const groups = useMemo(() => {
    if (categories.length === 0) return [{ id: "all", name: null as string | null, items: visibleServices }];
    const known = new Set(categories.map((c) => c.id));
    const grouped = categories.map((c) => ({
      id: c.id,
      name: c.name as string | null,
      items: visibleServices.filter((s) => s.categoryId === c.id),
    }));
    const rest = visibleServices.filter((s) => !s.categoryId || !known.has(s.categoryId));
    if (rest.length > 0) grouped.push({ id: "other", name: "Outros serviços", items: rest });
    return grouped.filter((g) => g.items.length > 0);
  }, [categories, visibleServices]);
  const searching = query.trim() !== "";
  const eligible = useMemo(
    () =>
      selected.length === 0
        ? []
        : professionals.filter((p) => selected.every((s) => s.professionalIds.includes(p.id))),
    [selected, professionals],
  );
  const totalMin = selected.reduce((sum, s) => sum + s.durationMin, 0);
  const totalCents = selected.reduce((sum, s) => sum + s.priceCents, 0);
  const professional = professionals.find((p) => p.id === professionalId) ?? null;
  const serviceNames = selected.map((s) => s.name).join(" + ");

  // Histórico: cada passo é uma entrada, então o Voltar do celular volta um passo.
  // A entrada inicial fica como o Next a criou (sem `bookingStep` = passo 1): trocar
  // o estado dela aqui, antes de o roteador instalar os próprios ganchos, apagaria
  // o que ele guarda e o Voltar recarregaria a página.
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const value = (event.state as { bookingStep?: unknown } | null)?.bookingStep;
      setStep(value === 1 || value === 2 || value === 3 ? value : 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Passo mostrado: o Avançar do navegador pode cair num passo sem os dados dele
  // (recarregou, ou o horário foi limpo): volta ao passo que falta.
  const view: Step = selected.length === 0 ? 0 : step === 3 && !slot ? 2 : step;

  // Cada passo novo abre no topo e leva o foco ao título (leitores de tela e teclado).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    document.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true });
  }, [view, done]);

  function goTo(next: Step) {
    window.history.pushState({ bookingStep: next }, "");
    setStep(next);
  }

  function toggleService(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setSlot(null);
    setSlotError(null);
  }

  function continueFromServices() {
    if (selected.length === 0 || eligible.length === 0) return;
    if (lockedProfessional) {
      // Profissional já escolhido na página dele: segue direto para a data.
      setProfessionalId(lockedProfessional.id);
      goTo(2);
      return;
    }
    if (eligible.length === 1) {
      // Um profissional só: o passo 2 é pulado.
      setProfessionalId(eligible[0].id);
      goTo(2);
      return;
    }
    if (professionalId !== "any" && !eligible.some((p) => p.id === professionalId)) {
      setProfessionalId("any");
    }
    goTo(1);
  }

  function choosePro(id: string) {
    setProfessionalId(id);
    setSlot(null);
    setSlotError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!slot || pending) return;

    const errors: Record<string, string> = {};
    const name = form.name.trim();
    if (name.length < 2 || name.length > 80) errors.name = "Informe seu nome (de 2 a 80 caracteres).";
    if (!normalizeBrazilPhone(form.phone)) errors.phone = "Informe um WhatsApp com DDD.";
    if (!form.consent) errors.consent = CONSENT_MESSAGE;
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      const result = await bookAction(tenant.slug, {
        serviceIds: selectedIds,
        professionalId,
        startsAt: slot.startsAt,
        name,
        phone: form.phone,
        email: form.email.trim(),
        consent: form.consent,
      });
      if (result.ok) {
        setDone({ token: result.token, booking: result.booking, firstName: name.split(/\s+/)[0] });
        // Recarregar a página cai na gestão do agendamento, não numa agenda vazia.
        window.history.replaceState(null, "", `/agendamento/${result.token}`);
        requestAnimationFrame(() => document.getElementById("confirmation-title")?.focus());
        return;
      }
      if (result.code === "slot_taken") {
        // Volta ao passo do horário mantendo os dados digitados.
        setSlot(null);
        setSlotError(SLOT_TAKEN_MESSAGE);
        setReloadKey((n) => n + 1);
        window.history.back();
        return;
      }
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      setFormError(result.error);
    } catch {
      setFormError("Não foi possível agendar agora. Confira sua conexão e tente de novo.");
    } finally {
      setPending(false);
    }
  }

  if (done) return <Confirmation tenant={tenant} booking={done.booking} token={done.token} firstName={done.firstName} />;

  const summaryLabel = `${selected.length} ${selected.length === 1 ? "serviço" : "serviços"} · ${formatDuration(totalMin)}`;

  return (
    <>
      {view === 0 ? (
        <header className="flex flex-col gap-4 pt-5">
          <div className="flex items-center gap-3.5 px-5">
            <BrandMark name={tenant.name} logoUrl={tenant.logoUrl} size="lg" />
            <div className="flex min-w-0 flex-col gap-[3px]">
              <h1 className="m-0 font-display text-[21px] leading-tight font-semibold">{tenant.name}</h1>
              <span className="text-[13px] text-ink-muted">
                {tenant.subtitle ?? "Agendamento online"}
              </span>
            </div>
          </div>
          {lockedProfessional ? (
            <div className="mx-5 flex items-center gap-3.5 rounded-2xl border border-line bg-canvas p-3.5">
              <ProfessionalAvatar member={lockedProfessional} size={64} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[12.5px] text-ink-muted">Agendando com</span>
                <span className="truncate font-display text-[18px] font-semibold">
                  {lockedProfessional.name}
                </span>
                {lockedProfessional.title ? (
                  <span className="truncate text-[13px] text-ink-muted">{lockedProfessional.title}</span>
                ) : null}
              </div>
              <Link
                href={`/${tenant.slug}`}
                className="flex min-h-11 shrink-0 items-center px-1 text-[13px] font-semibold text-(--brand) underline-offset-4 hover:underline"
              >
                Trocar
              </Link>
            </div>
          ) : content.heroImages.length > 0 ? (
            <HeroCarousel
              images={content.heroImages}
              title={content.heroTitle ?? DEFAULT_HERO_TITLE}
              subtitle={content.heroSubtitle ?? DEFAULT_HERO_SUBTITLE}
            />
          ) : null}
          <div className="flex flex-col gap-3 border-b border-line bg-canvas px-5 pt-4 pb-4">
            <h2 className="m-0 font-display text-[15px] font-semibold">Seu agendamento</h2>
            <ProgressThread steps={STEPS} current={0} label="Etapas do agendamento" />
          </div>
        </header>
      ) : (
        <header className="flex flex-col gap-4 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Voltar"
              onClick={() => window.history.back()}
              className="-ml-2.5 grid size-11 shrink-0 place-items-center rounded-xl text-foreground hover:bg-primary-soft"
            >
              <ChevronLeft className="size-[22px]" aria-hidden="true" />
            </button>
            <CompactBrand tenant={tenant} />
          </div>
          <ProgressThread steps={STEPS} current={view} label="Etapas do agendamento" />
        </header>
      )}

      {view === 0 ? (
        <>
          <main className="flex flex-1 flex-col gap-5 pt-5">
            <div className="flex flex-col gap-3.5 px-5">
              <label className="flex min-h-[50px] items-center gap-3 rounded-2xl border border-line bg-canvas px-4 focus-within:outline-2 focus-within:outline-(--brand)">
                <Search className="size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pesquisar serviço"
                  aria-label="Pesquisar serviço"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-muted"
                />
              </label>
              <div className="flex flex-col gap-0.5">
                <h2 tabIndex={-1} data-step-heading className="m-0 font-display text-[22px] font-semibold outline-none">
                  {lockedProfessional ? `Serviços de ${lockedProfessional.name.split(/\s+/)[0]}` : "Todos os serviços"}
                </h2>
                <p className="m-0 text-[13px] text-ink-muted">Escolha um ou mais serviços</p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 px-5">
              {groups.map((group) => {
                const open = group.name === null || searching || openGroups.includes(group.id);
                const chosen = group.items.filter((s) => selectedIds.includes(s.id)).length;
                const panelId = `group-${group.id}`;
                return (
                  <div key={group.id} className="flex flex-col gap-2.5">
                    {group.name !== null ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() =>
                          setOpenGroups((ids) =>
                            ids.includes(group.id) ? ids.filter((id) => id !== group.id) : [...ids, group.id],
                          )
                        }
                        className="flex min-h-[51px] items-center gap-3 rounded-2xl border border-line bg-canvas px-4 text-left"
                      >
                        <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold">{group.name}</span>
                        {chosen > 0 ? (
                          <span className="shrink-0 rounded-full bg-(--brand) px-2 py-0.5 text-xs font-semibold text-white">
                            {chosen}
                          </span>
                        ) : null}
                        <ChevronDown
                          className={`size-[18px] shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                    ) : null}
                    {open ? (
                      <ul id={panelId} className="m-0 flex list-none flex-col gap-2.5 p-0">
                        {group.items.map((service) => {
                          const checked = selectedIds.includes(service.id);
                          return (
                            <li key={service.id}>
                              <label
                                className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border bg-canvas p-3.5 transition-colors ${
                                  checked ? "border-(--brand)" : "border-line"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleService(service.id)}
                                  aria-label={service.name}
                                  className="m-0 mt-1 size-[22px] shrink-0 accent-(--brand)"
                                />
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                  <span className="text-base font-semibold">{service.name}</span>
                                  <span className="text-[13px] text-ink-muted">
                                    <span className="tabular-nums">{formatDuration(service.durationMin)}</span>
                                    {service.description ? ` · ${service.description}` : ""}
                                  </span>
                                  <span className="mt-1 self-end text-base font-bold tabular-nums text-(--brand)">
                                    {formatBRL(service.priceCents)}
                                  </span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {visibleServices.length === 0 ? (
              <p className="m-0 px-5 text-sm text-ink-muted">Nenhum serviço com esse nome.</p>
            ) : null}
            {selected.length > 0 && eligible.length === 0 ? (
              <div className="px-5">
                <FormAlert>
                  Nenhum profissional faz esses serviços juntos. Escolha um de cada vez.
                </FormAlert>
              </div>
            ) : null}
            {lockedProfessional ? null : <TeamSection slug={tenant.slug} team={content.team} />}
            <StudioInfo
              address={tenant.address}
              rows={content.weekRows}
              instagram={content.instagram}
              facebook={content.facebook}
            />
            <div className="mt-2 flex flex-col items-center gap-1 border-t border-line px-5 pt-4 pb-6 text-center">
              <span className="text-[13px] text-ink-muted">Agendamento simples e seguro</span>
              <span className="text-xs text-ink-muted">Desenvolvido com Eneven Agenda Inteligente</span>
            </div>
          </main>
          <Footer
            summary={
              selected.length === 0 ? (
                <span className="text-ink-muted">Escolha ao menos um serviço</span>
              ) : (
                <>
                  <span className="text-ink-muted tabular-nums">{summaryLabel}</span>
                  <span className="font-bold tabular-nums">{formatBRL(totalCents)}</span>
                </>
              )
            }
            disabled={selected.length === 0 || eligible.length === 0}
            onContinue={continueFromServices}
          />
        </>
      ) : null}

      {view === 1 ? (
        <>
          <main className="flex flex-1 flex-col gap-3 px-5 pt-[18px]">
            <div className="flex flex-col gap-1">
              <h2 tabIndex={-1} data-step-heading className="m-0 font-display text-[19px] font-semibold outline-none">Com quem você quer agendar?</h2>
              <span className="text-[13px] text-ink-muted">{serviceNames}</span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              <ProOption
                checked={professionalId === "any"}
                onSelect={() => choosePro("any")}
                label="Qualquer profissional disponível"
                icon={
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-foreground"
                  >
                    <Users className="size-4" />
                  </span>
                }
              />
              {eligible.map((pro) => (
                <ProOption
                  key={pro.id}
                  checked={professionalId === pro.id}
                  onSelect={() => choosePro(pro.id)}
                  label={pro.name}
                  icon={
                    <span
                      aria-hidden="true"
                      className="mx-[11px] size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: pro.color ?? "var(--ink-muted)" }}
                    />
                  }
                />
              ))}
            </ul>
          </main>
          <Footer
            summary={
              <>
                <span className="text-ink-muted tabular-nums">{summaryLabel}</span>
                <span className="font-bold tabular-nums">{formatBRL(totalCents)}</span>
              </>
            }
            onContinue={() => goTo(2)}
          />
        </>
      ) : null}

      {view === 2 ? (
        <>
          <main className="flex flex-1 flex-col gap-4 px-5 pt-[18px]">
            <div className="flex flex-col gap-1">
              <h2 tabIndex={-1} data-step-heading className="m-0 font-display text-[19px] font-semibold outline-none">Escolha o dia e o horário</h2>
              <span className="text-[13px] text-ink-muted">
                {serviceNames} · {formatDuration(totalMin)} ·{" "}
                {professional ? `com ${professional.name}` : "com qualquer profissional"}
              </span>
            </div>
            {slotError ? <FormAlert>{slotError}</FormAlert> : null}
            <SlotPicker
              today={today}
              loadKey={`${selectedIds.join(",")}|${professionalId}|${reloadKey}`}
              loadDates={async (from) => {
                const r = await getDatesAction(tenant.slug, {
                  serviceIds: selectedIds,
                  professionalId,
                  from,
                });
                return r.ok ? { ok: true, data: r.dates } : r;
              }}
              loadSlots={async (date) => {
                const r = await getSlotsAction(tenant.slug, {
                  serviceIds: selectedIds,
                  professionalId,
                  date,
                });
                return r.ok ? { ok: true, data: r.slots } : r;
              }}
              value={slot}
              onChange={(next) => {
                setSlot(next);
                if (next) setSlotError(null);
              }}
              noDates={
                <>
                  Sem horários livres nos próximos dias.{" "}
                  {tenant.whatsapp ? (
                    <a
                      href={whatsappUrl(tenant.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-foreground underline underline-offset-4"
                    >
                      Fale com {tenant.name} no WhatsApp
                    </a>
                  ) : (
                    `Fale com ${tenant.name}.`
                  )}
                </>
              }
            />
          </main>
          <Footer
            summary={
              slot ? (
                <>
                  <span className="text-ink-muted">{formatLongDate(slot.date)}</span>
                  <span className="font-bold tabular-nums">{slot.time}</span>
                </>
              ) : (
                <span className="text-ink-muted">Escolha um horário</span>
              )
            }
            disabled={!slot}
            onContinue={() => goTo(3)}
          />
        </>
      ) : null}

      {view === 3 && slot ? (
        <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
          <main className="flex flex-1 flex-col gap-5 px-5 pt-[18px] pb-5">
            <h2 tabIndex={-1} data-step-heading className="m-0 font-display text-[19px] font-semibold outline-none">Seus dados</h2>

            <div className="flex items-start justify-between gap-3 rounded-panel bg-canvas p-4 text-sm leading-snug">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{serviceNames}</span>
                <span className="text-ink-muted tabular-nums">
                  {formatLongDate(slot.date)} às {slot.time}
                </span>
                <span className="text-ink-muted">
                  {professional ? `com ${professional.name}` : "com qualquer profissional"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  // Volta ao começo mantendo tudo o que já foi escolhido.
                  window.history.go(-3 + (eligible.length === 1 || lockedProfessional ? 1 : 0));
                }}
                className="flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-foreground underline underline-offset-4"
              >
                Alterar
              </button>
            </div>

            {formError ? <FormAlert>{formError}</FormAlert> : null}

            <TextField
              name="name"
              label="Seu nome"
              autoComplete="name"
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={fieldErrors.name}
            />
            <TextField
              name="phone"
              label="WhatsApp"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 99999-9999"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatBrazilPhone(e.target.value) })}
              error={fieldErrors.phone}
            />
            <TextField
              name="email"
              label="E-mail (opcional)"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={fieldErrors.email}
            />

            <div className="flex flex-col gap-1.5">
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
                <input
                  type="checkbox"
                  name="consent"
                  checked={form.consent}
                  onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                  aria-invalid={fieldErrors.consent ? true : undefined}
                  aria-describedby={fieldErrors.consent ? "consent-error" : undefined}
                  className="m-0 mt-0.5 size-[22px] shrink-0 accent-(--brand)"
                />
                <span>
                  Concordo com o uso dos meus dados para este agendamento, conforme a{" "}
                  <Link
                    href="/privacidade"
                    target="_blank"
                    className="font-semibold underline underline-offset-4"
                  >
                    Política de privacidade
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.consent ? (
                <p id="consent-error" className="m-0 text-sm text-danger">
                  {fieldErrors.consent}
                </p>
              ) : null}
            </div>
          </main>
          <div className="sticky bottom-0 flex flex-col gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[max(20px,env(safe-area-inset-bottom))]">
            <button type="submit" disabled={pending} className={brandButton}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Confirmando…
                </>
              ) : (
                "Confirmar agendamento"
              )}
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}

function ProOption({
  checked,
  onSelect,
  label,
  icon,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <li className="border-b border-line">
      <label className="flex min-h-[68px] cursor-pointer items-center gap-3.5 py-3">
        <input
          type="radio"
          name="professional"
          checked={checked}
          onChange={onSelect}
          className="m-0 size-[22px] shrink-0 accent-(--brand)"
        />
        {icon}
        <span className="min-w-0 flex-1 text-base font-semibold">{label}</span>
      </label>
    </li>
  );
}

/** Barra fixa inferior: resumo à esquerda/direita e o botão "Continuar" na cor da marca. */
function Footer({
  summary,
  onContinue,
  disabled,
  poweredBy,
}: {
  summary: ReactNode;
  onContinue: () => void;
  disabled?: boolean;
  poweredBy?: boolean;
}) {
  return (
    <div className="sticky bottom-0 flex flex-col gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-3 text-sm">{summary}</div>
      <button type="button" onClick={onContinue} disabled={disabled} className={brandButton}>
        Continuar
      </button>
      {poweredBy ? (
        <span className="self-center text-xs text-ink-muted">Agendamento por Eneven Agenda</span>
      ) : null}
    </div>
  );
}
