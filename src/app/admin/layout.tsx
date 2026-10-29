import { AdminHeader } from "@/components/platform/admin-header";
import { ToastProvider } from "@/components/ui/toast";
import { canAccessTenantPanel, requireSuperAdminSession } from "@/server/auth/guard";

/**
 * Casca da plataforma. Cada página também chama `requireSuperAdminSession()`:
 * o layout não é renderizado de novo a cada navegação interna, então ele sozinho
 * não protege os dados das páginas.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireSuperAdminSession();
  // "Meu estabelecimento": só fora do modo suporte e para quem tem estabelecimento próprio.
  const hasOwnTenant = canAccessTenantPanel(session) && !session.support;

  return (
    <ToastProvider sidebar={false}>
      <div className="min-h-dvh bg-canvas">
        <AdminHeader hasOwnTenant={hasOwnTenant} />
        {children}
      </div>
    </ToastProvider>
  );
}
