import Link from "next/link";

export default function SignupSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          Payment received
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          We&apos;re finishing setting up your account — this usually takes
          just a few seconds. Sign in below; if it says your account isn&apos;t
          provisioned yet, wait a moment and try again.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
