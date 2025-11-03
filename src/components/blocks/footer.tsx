import Link from "next/link";

export function Footer() {
  return (
    <footer className="flex flex-col items-center gap-6 py-8">
      <nav className="container flex flex-col items-center gap-4">
        <Link
          href="/privacy"
          className="text-muted-foreground text-sm transition-opacity hover:opacity-75"
        >
          Privacy Policy
        </Link>
      </nav>
    </footer>
  );
}
