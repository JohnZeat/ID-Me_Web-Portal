import { Spinner } from "@/components/spinner";

export default function DashboardLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Spinner />
    </main>
  );
}
