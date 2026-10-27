"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClientAction, updateClientAction } from "@/app/painel/clientes/actions";
import { PanelDialog } from "@/components/agenda/panel-dialog";
import { FormAlert } from "@/components/auth/form-alert";
import { FieldError } from "@/components/catalog/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatBrazilPhone } from "@/lib/phone";
import { clientsHref } from "./view";

export type ClientFormValues = { name: string; phone: string; email: string; notes: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Sem `client`, cria um cliente novo; com ele, edita. */
  client?: { id: string } & ClientFormValues;
};

/** Novo cliente / Editar dados (docs/design/telas/plano-3.md): 480px, tela cheia no celular. */
export function ClientFormDialog({ open, onClose, client }: Props) {
  const editing = client !== undefined;
  return (
    <PanelDialog
      open={open}
      onClose={onClose}
      narrow
      title={editing ? "Editar dados" : "Novo cliente"}
      titleId={editing ? "edit-client-title" : "new-client-title"}
    >
      <ClientForm client={client} onClose={onClose} />
    </PanelDialog>
  );
}

function ClientForm({ client, onClose }: Pick<Props, "client" | "onClose">) {
  const router = useRouter();
  const toast = useToast();
  const editing = client !== undefined;
  const [name, setName] = useState(client?.name ?? "");
  const [phone, setPhone] = useState(client ? formatBrazilPhone(client.phone) : "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [existingId, setExistingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setErrors({});
    setExistingId(null);
    setFormError(null);
    try {
      const input = { name, phone, email, notes };
      const result = client ? await updateClientAction(client.id, input) : await createClientAction(input);
      if (result.ok) {
        toast.show(result.message);
        onClose();
        if (!editing && result.id) router.push(clientsHref({ id: result.id }));
        else router.refresh();
        return;
      }
      if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
        setErrors(result.fieldErrors);
        setExistingId(result.existingId ?? null);
      } else {
        setFormError(result.error);
      }
    } catch {
      setFormError("Não foi possível salvar agora. Tente novamente em instantes.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Nome
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "client-name-error" : undefined}
          className="font-normal"
        />
        <FieldError id="client-name-error">{errors.name}</FieldError>
      </label>

      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          WhatsApp
          <Input
            value={phone}
            onChange={(e) => setPhone(formatBrazilPhone(e.target.value))}
            inputMode="tel"
            autoComplete="off"
            placeholder="(11) 99999-9999"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? "client-phone-error" : undefined}
            className="font-normal tabular-nums"
          />
        </label>
        <FieldError id="client-phone-error">{errors.phone}</FieldError>
        {existingId ? (
          <Link
            href={clientsHref({ id: existingId })}
            onClick={onClose}
            className="flex min-h-11 w-fit items-center text-sm font-semibold text-primary hover:underline"
          >
            Abrir cadastro
          </Link>
        ) : null}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>
          E-mail <span className="font-normal text-ink-muted">(opcional)</span>
        </span>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "client-email-error" : undefined}
          className="font-normal"
        />
        <FieldError id="client-email-error">{errors.email}</FieldError>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>
          Observações <span className="font-normal text-ink-muted">(opcional)</span>
        </span>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          aria-invalid={errors.notes ? true : undefined}
          aria-describedby={errors.notes ? "client-notes-error" : undefined}
          className="font-normal"
        />
        <FieldError id="client-notes-error">{errors.notes}</FieldError>
      </label>

      <div className="mt-auto flex gap-3 pt-2">
        <Button type="button" variant="outline" size="lg" onClick={onClose} className="flex-1 lg:flex-none lg:px-6">
          Voltar
        </Button>
        <Button type="submit" size="lg" disabled={pending} className="flex-1">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {editing ? "Salvar alterações" : "Salvar cliente"}
        </Button>
      </div>
    </form>
  );
}
