import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">ID-Me</h1>
      <p className="max-w-sm text-sm text-gray-500">
        Subscriber / Staff portal — proof of concept.
      </p>
      <Link
        href="/login"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Staff sign in
      </Link>
    </main>
  );
}
