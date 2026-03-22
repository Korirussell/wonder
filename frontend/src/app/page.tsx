import { DAWProvider } from "@/lib/DAWContext";
import WonderShell from "@/components/WonderShell";

export default function Home() {
  return (
    <DAWProvider>
      <WonderShell />
    </DAWProvider>
  );
}
