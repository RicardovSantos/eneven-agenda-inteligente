/**
 * Esqueleto mostrado na hora ao trocar de aba do painel, enquanto o servidor monta a página.
 * Sem este arquivo o Next não pré-carrega páginas dinâmicas e o clique fica parado até a resposta.
 */
export default function PainelLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="mx-auto flex w-full max-w-[1208px] flex-col gap-3 motion-safe:animate-pulse lg:gap-5">
      <span className="sr-only">Carregando…</span>
      <div className="h-8 w-48 rounded-field bg-line lg:h-10" />
      <div className="grid grid-cols-2 gap-2.5 lg:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-[14px] border border-line bg-surface lg:h-32 lg:rounded-panel" />
        ))}
      </div>
      <div className="h-64 rounded-card border border-line bg-surface" />
    </div>
  );
}
