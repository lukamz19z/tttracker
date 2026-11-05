import ProjectsPage from "./(protected)/page";
import { AccessProvider } from "@/components/access/access-provider";

export default function HomePage() {
  return <AccessProvider><ProjectsPage /></AccessProvider>;
}
