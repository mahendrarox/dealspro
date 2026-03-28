import { redirect } from "next/navigation";

export default async function DealRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/drop/${id}`);
}
