import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botão principal (48px, largura total) com estado de envio. */
export function SubmitButton({
  pending,
  idleLabel,
  pendingLabel,
}: {
  pending: boolean;
  idleLabel: string;
  pendingLabel: string;
}) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          <span role="status">{pendingLabel}</span>
        </>
      ) : (
        idleLabel
      )}
    </Button>
  );
}
