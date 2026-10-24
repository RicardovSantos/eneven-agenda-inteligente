/** Aviso de sucesso do formulário: mesma faixa do erro, com borda verde. */
export function FormNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-field border-l-[3px] border-success bg-success/10 px-4 py-3 text-sm leading-snug text-foreground"
    >
      {children}
    </div>
  );
}

/** Erro geral do formulário: faixa com borda esquerda de 3px. */
export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-field border-l-[3px] border-danger bg-danger-soft px-4 py-3 text-sm leading-snug text-foreground"
    >
      {children}
    </div>
  );
}
