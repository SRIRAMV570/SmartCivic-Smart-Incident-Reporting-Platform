import type { ReactNode } from "react";
import PortalGuard from "@/components/portal-guard";

export default function LegacyDepartmentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PortalGuard role="admin">{children}</PortalGuard>;
}
