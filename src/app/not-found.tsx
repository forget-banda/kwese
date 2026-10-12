import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="font-heading text-3xl font-semibold">That page is not on the desk.</p>
      <Link href="/" className="mt-3 text-primary">Back to home</Link>
    </main>
  );
}
