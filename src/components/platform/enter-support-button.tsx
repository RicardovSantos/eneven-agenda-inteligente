"use client";

import { LogIn, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { enterSupportAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** "Entrar como o estabelecimento": inicia o suporte e o servidor redireciona para `/painel`. */
export function EnterSupportButton({ tenantId }: { tenantId: string }) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await enterSupportAction(tenantId);
          if (result && !result.ok) show(result.error, "error");
        })
      }
      className="gap-2 px-[18px] text-[0.9375rem]"
    >
      {pending ? (
        <Loader2 className="size-[18px] animate-spin" aria-hidden="true" />
      ) : (
        <LogIn className="size-[18px]" aria-hidden="true" />
      )}
      Entrar como o estabelecimento
    </Button>
  );
}
