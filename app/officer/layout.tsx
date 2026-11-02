import type { ReactNode } from "react";
import PortalGuard from "@/components/portal-guard";

export default function OfficerLayout({ children }: { children: ReactNode }) {
  return <PortalGuard role="officer">{children}</PortalGuard>;
}
