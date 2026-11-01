"use client";

import { useActionState, useState } from "react";
import {
  saveBusinessInfoAction,
  type SettingsFormState,
} from "@/app/painel/configuracoes/actions";
import { TextField } from "@/components/auth/text-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToastOnResult } from "@/components/ui/toast";
import { formatBrazilPhone } from "@/lib/phone";
import { SaveRow, SettingsSection } from "./settings-section";

const ABOUT_MAX = 160;

export type BusinessInfoInitial = {
  name: string;
  whatsapp: string;
  address: string;
  instagram: string;
  facebook: string;
  about: string;
};

export function BusinessInfoForm({ initial }: { initial: BusinessInfoInitial }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    saveBusinessInfoAction,
    {},
  );
  useToastOnResult(state);

  const [name, setName] = useState(initial.name);
  const [whatsapp, setWhatsapp] = useState(formatBrazilPhone(initial.whatsapp));
  const [address, setAddress] = useState(initial.address);
  const [instagram, setInstagram] = useState(initial.instagram);
  const [facebook, setFacebook] = useState(initial.facebook);
  const [about, setAbout] = useState(initial.about);
  const errors = state.fieldErrors ?? {};
  const left = ABOUT_MAX - about.length;

  return (
    <SettingsSection
      id="info"
      title="Seu estabelecimento"
      description="Aparecem na sua página de agendamento."
    >
      <form action={formAction} noValidate className="flex flex-col gap-5">
        <TextField
          name="name"
          label="Nome do estabelecimento"
          autoComplete="organization"
          className="h-11"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="whatsapp"
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(11) 99999-9999"
            className="h-11"
            value={whatsapp}
            onChange={(e) => setWhatsapp(formatBrazilPhone(e.target.value))}
            error={errors.whatsapp}
          />
          <TextField
            name="instagram"
            label="Instagram (opcional)"
            placeholder="@seusalao"
            autoCapitalize="none"
            spellCheck={false}
            className="h-11"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            error={errors.instagram}
          />
        </div>
        <TextField
          name="facebook"
          label="Facebook (opcional)"
          placeholder="seusalao ou link da página"
          autoCapitalize="none"
          spellCheck={false}
          className="h-11"
          value={facebook}
          onChange={(e) => setFacebook(e.target.value)}
          error={errors.facebook}
        />
        <TextField
          name="address"
          label="Endereço (opcional)"
          autoComplete="street-address"
          placeholder="Rua, número e bairro"
          className="h-11"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={errors.address}
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="about">Sobre (opcional)</Label>
            <span
              className={`text-[0.8125rem] tabular-nums ${left < 0 ? "text-danger" : "text-ink-muted"}`}
              aria-live="polite"
            >
              {about.length}/{ABOUT_MAX}
            </span>
          </div>
          <Textarea
            id="about"
            name="about"
            rows={3}
            placeholder="Conte em uma frase o que você faz."
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            aria-invalid={errors.about ? true : undefined}
            aria-describedby={errors.about ? "about-error" : undefined}
          />
          {errors.about ? (
            <p id="about-error" className="text-[0.8125rem] leading-snug text-danger">
              {errors.about}
            </p>
          ) : null}
        </div>
        <SaveRow pending={pending} error={state.error} />
      </form>
    </SettingsSection>
  );
}
