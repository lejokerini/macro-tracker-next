import type { Metadata } from "next";
import MacroTrackerApp from "@/components/MacroTrackerApp";

export const metadata: Metadata = {
  title: "Macrolens · l'application",
  description: "Ton suivi de calories et de macros : photo, code-barres, journal et programmes.",
};

export default function AppPage() {
  return <MacroTrackerApp />;
}
