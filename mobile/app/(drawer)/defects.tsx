import DefectsScreen from "../defects/index";
import { QualityProvider } from "@/contexts/QualityContext";
export default function DrawerDefectsScreen() { return <QualityProvider><DefectsScreen /></QualityProvider>; }
