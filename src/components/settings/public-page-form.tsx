"use client";

import { ImageIcon } from "lucide-react";
import { useActionState } from "react";
import {
  removeHeroPhotoAction,
  saveHeroTextAction,
  uploadHeroPhotoAction,
  type SettingsFormState,
} from "@/app/painel/configuracoes/actions";
import { TextField } from "@/components/auth/text-field";
import { PhotoField, type PhotoResult } from "@/components/media/photo-field";
import { useToast, useToastOnResult } from "@/components/ui/toast";
import { SaveRow, SettingsSection } from "./settings-section";

const HERO_SLOTS = [
  { slot: 0, label: "Imagem 1", hint: "Ex.: o ambiente por dentro." },
  { slot: 1, label: "Imagem 2", hint: "Ex.: a fachada, para encontrarem fácil." },
  { slot: 2, label: "Imagem 3", hint: "Ex.: um trabalho seu ou um detalhe do espaço." },
];

export type PublicPageInitial = {
  heroTitle: string;
  heroSubtitle: string;
  /** Endereço de cada posição (0 a 2) ou `null` quando vazia. */
  photos: Array<string | null>;
};

const HERO_TITLE_MAX = 60;
const HERO_SUBTITLE_MAX = 100;

/** "Página de agendamento": as três imagens do carrossel e a frase que aparece sobre elas. */
export function PublicPageForm({ initial }: { initial: PublicPageInitial }) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    saveHeroTextAction,
    {},
  );
  useToastOnResult(state);
  const errors = state.fieldErrors ?? {};

  async function send(action: (s: SettingsFormState, f: FormData) => Promise<SettingsFormState>, data: FormData, fallback: string): Promise<PhotoResult> {
    const result = await action({}, data);
    const error = result.error ?? result.fieldErrors?.photo ?? result.fieldErrors?.slot;
    if (error) return { ok: false, error };
    toast.show(result.message ?? fallback);
    return { ok: true };
  }

  return (
    <SettingsSection
      id="public-page"
      title="Página de agendamento"
      description="Até 3 imagens do seu espaço passam sozinhas no topo da página. Envie a foto em qualquer formato: ela é convertida para WebP para carregar rápido."
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 sm:grid-cols-3">
          {HERO_SLOTS.map(({ slot, label, hint }) => (
            <PhotoField
              key={slot}
              label={label}
              hint={hint}
              shape="wide"
              maxSide={1600}
              currentUrl={initial.photos[slot] ?? null}
              placeholder={<ImageIcon className="size-7" aria-hidden="true" />}
              onUpload={(file) => {
                const data = new FormData();
                data.set("slot", String(slot));
                data.set("photo", file);
                return send(uploadHeroPhotoAction, data, "Imagem atualizada");
              }}
              onRemove={() => {
                const data = new FormData();
                data.set("slot", String(slot));
                return send(removeHeroPhotoAction, data, "Imagem removida");
              }}
            />
          ))}
        </div>

        <form action={formAction} noValidate className="flex flex-col gap-5">
          <TextField
            name="heroTitle"
            label="Título sobre as imagens (opcional)"
            placeholder="Seu cuidado começa aqui"
            maxLength={HERO_TITLE_MAX}
            className="h-11"
            defaultValue={initial.heroTitle}
            error={errors.heroTitle}
          />
          <TextField
            name="heroSubtitle"
            label="Frase abaixo do título (opcional)"
            placeholder="Escolha o serviço e agende em poucos passos"
            maxLength={HERO_SUBTITLE_MAX}
            className="h-11"
            defaultValue={initial.heroSubtitle}
            error={errors.heroSubtitle}
          />
          <SaveRow pending={pending} error={state.error} />
        </form>
      </div>
    </SettingsSection>
  );
}
