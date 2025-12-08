import { Inter } from "next/font/google";
import localFont from "next/font/local";

import type { Metadata } from "next";

import { Footer } from "@/components/blocks/footer";
import { ConditionalNavbar } from "@/components/ConditionalNavbar";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { StyleGlideProvider } from "@/components/styleglide-provider";
import { ThemeInitializer } from "@/components/theme-initializer";
import { ThemeProvider } from "@/components/theme-provider";
import { FeatureFlagsProvider } from "@/lib/features/client";
import { getServerFeatureFlags } from "@/lib/features/server";
import "@/styles/globals.css";

const dmSans = localFont({
  src: [
    {
      path: "../../fonts/dm-sans/DMSans-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/dm-sans/DMSans-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../fonts/dm-sans/DMSans-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../fonts/dm-sans/DMSans-MediumItalic.ttf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../../fonts/dm-sans/DMSans-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../fonts/dm-sans/DMSans-SemiBoldItalic.ttf",
      weight: "600",
      style: "italic",
    },
    {
      path: "../../fonts/dm-sans/DMSans-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../fonts/dm-sans/DMSans-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Sunshine",
    template: "%s | Sunshine",
  },
  description:
    "Your Observability Co-Pilot. Centralize insights, optimize costs, and automate improvements across observability platforms. Starting with Datadog, expanding to New Relic, Instana, and more.",
  keywords: [
    "observability",
    "datadog",
    "monitoring",
    "finops",
    "cost optimization",
    "observability platform",
    "new relic",
    "instana",
    "apm",
    "monitoring tools",
  ],
  authors: [{ name: "Sunny Systems" }],
  creator: "Sunny Systems",
  publisher: "Sunny Systems",
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "48x48" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon.ico" },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: [{ url: "/favicon/favicon.ico" }],
  },
  openGraph: {
    title: "Sunshine",
    description:
      "Your Observability Co-Pilot. Centralize insights, optimize costs, and automate improvements across observability platforms.",
    siteName: "Sunshine",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Sunshine - Your Observability Co-Pilot",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sunshine",
    description:
      "Your Observability Co-Pilot. Centralize insights, optimize costs, and automate improvements across observability platforms.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const featureFlags = getServerFeatureFlags();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          async
          crossOrigin="anonymous"
          src="https://tweakcn.com/live-preview.min.js"
        />
      </head>
      <body className={`${dmSans.variable} ${inter.variable} antialiased`}>
        <FeatureFlagsProvider initialFlags={featureFlags}>
          <SessionProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <ThemeInitializer />
              <StyleGlideProvider />
              <ConditionalNavbar />
              <main className="">{children}</main>
              <Footer />
            </ThemeProvider>
          </SessionProvider>
        </FeatureFlagsProvider>
      </body>
    </html>
  );
}
