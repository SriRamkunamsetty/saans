import { AssistantApp } from "@/components/AssistantApp";

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="site-header">
        <p className="brand">Saans</p>
        <p className="tagline">Breathe easier through smog season</p>
      </header>
      <main id="main" tabIndex={-1} className="container">
        <h1>Your personal urban air quality assistant</h1>
        <p className="lead">
          Pick your place and tell us a little about your household. You&apos;ll get a plan for
          today: what to change in your routine, how to protect the air at home, and greener
          alternatives — each with its direct impact explained.
        </p>
        <AssistantApp />
      </main>
      <footer className="site-footer">
        <p>
          Air quality data: <a href="https://open-meteo.com/">Open-Meteo</a> with CAMS ENSEMBLE data
          from the{" "}
          <a href="https://atmosphere.copernicus.eu/">Copernicus Atmosphere Monitoring Service</a>.
          Modelled estimates can differ from a street-level monitor. General information, not
          medical advice.
        </p>
      </footer>
    </>
  );
}
