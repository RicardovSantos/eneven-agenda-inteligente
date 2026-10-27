import { RegisterSw } from "@/components/pwa/register-sw";
import { PWA_METADATA } from "@/lib/pwa-manifest";

export const metadata = PWA_METADATA;

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <RegisterSw />
    </>
  );
}
