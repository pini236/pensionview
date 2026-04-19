import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PensionView",
  description: "Track your pension and savings",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
