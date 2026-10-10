import { learnSummary } from "./content";
import type { Demo } from "./demo";
import type { LandingFacts } from "./facts";
import { Anatomy } from "./sections/Anatomy";
import { Closing, Footer } from "./sections/Closing";
import { Data } from "./sections/Data";
import { Hero } from "./sections/Hero";
import { Learn } from "./sections/Learn";
import { Nav } from "./sections/Nav";
import { Rails } from "./sections/Rails";
import { Route } from "./sections/Route";
import { Tools } from "./sections/Tools";

export function LandingPage({ facts, demo }: { facts: LandingFacts; demo: Demo }) {
  const learn = learnSummary();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="rails" aria-hidden="true">
        <i className="o1" />
        <i className="c1" />
        <i className="c2" />
        <i className="o2" />
      </div>
      <Nav />
      <main id="main">
        <Hero facts={facts} />
        <Route demo={demo} />
        <Anatomy demo={demo} />
        <Rails facts={facts} />
        <Data facts={facts} demo={demo} />
        <Learn learn={learn} />
        <Tools facts={facts} demo={demo} />
        <Closing firstModuleHref={learn.firstModuleHref} />
      </main>
      <Footer />
    </>
  );
}
