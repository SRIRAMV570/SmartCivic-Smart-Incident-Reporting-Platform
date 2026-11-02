import type { ReactNode } from "react";
import PortalGuard from "@/components/portal-guard";

export default function CivicLayout({ children }: { children: ReactNode }) {
  return <PortalGuard role="resident">{children}</PortalGuard>;
}
