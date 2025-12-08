import { Background } from "@/components/background";
import { SunshineHero } from "@/components/blocks/sunshine-hero";
import { SunshineFeatures } from "@/components/blocks/sunshine-features";
import { SunshineValueProps } from "@/components/blocks/sunshine-value-props";
import { SunshineCTA } from "@/components/blocks/sunshine-cta";

export default function Home() {
  return (
    <>
      <Background className="via-muted to-muted/80">
        <SunshineHero />
        <SunshineFeatures />
      </Background>
      <SunshineValueProps />
      <Background variant="bottom">
        <SunshineCTA />
      </Background>
    </>
  );
}
