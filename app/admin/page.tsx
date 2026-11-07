import { redirect } from "next/navigation";

export const instant = false;

export default function AdminPage() {
  redirect("/admin/incidents");
}
