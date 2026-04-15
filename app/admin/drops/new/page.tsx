import { requireAdmin } from "@/lib/admin/auth";
import DropForm, { emptyDropForm } from "../drop-form";

export const dynamic = "force-dynamic";

export default async function NewDropPage() {
  await requireAdmin();
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 24px 0" }}>New Drop</h1>
      <DropForm mode="create" initial={emptyDropForm()} />
    </div>
  );
}
