import React from 'react';

interface LandingPageProps {
  onEnterWorkspace: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterWorkspace }) => (
  <div className="landing-root">
    <div className="landing-watermark" aria-hidden="true">GENLAYER</div>
    <header className="landing-nav">
      <a className="landing-brand" href="#top" aria-label="Veridex home">Veridex</a>
      <nav aria-label="Primary navigation">
        <a href="#product">Product</a>
        <a href="#how-it-works">How it works</a>
        <a href="#docs">Docs</a>
        <button type="button" onClick={onEnterWorkspace}>Open workspace →</button>
      </nav>
    </header>

    <main id="top">
      <section className="landing-hero" aria-labelledby="landing-title">
        <p className="landing-eyebrow">Consensus-backed emergency alert revision intelligence</p>
        <h1 id="landing-title">Know which public alert is operative.</h1>
        <p className="landing-intro">
          Veridex verifies NWS alert lineage, event identity, and instruction changes with
          GenLayer consensus—then preserves an auditable operational record.
        </p>
        <div className="landing-cta-row">
          <button className="landing-primary" type="button" onClick={onEnterWorkspace}>
            Explore Veridex
          </button>
          <a className="landing-secondary" href="#docs">Read the docs</a>
        </div>
      </section>

      <section className="landing-preview" id="product" aria-label="Product overview">
        <div className="preview-heading">
          <div><strong>Operational clarity</strong><span>One inspectable record across every accepted revision.</span></div>
          <span className="preview-live">Built on GenLayer</span>
        </div>
        <div className="preview-grid">
          <article><span>01</span><h2>Trace lineage</h2><p>Resolve bounded direct references before any operational update.</p></article>
          <article><span>02</span><h2>Compare meaning</h2><p>Classify material instruction changes through validator consensus.</p></article>
          <article><span>03</span><h2>Audit outcomes</h2><p>Retain fingerprints, status transitions, and acknowledgement history.</p></article>
        </div>
      </section>

      <section className="landing-safety" aria-labelledby="landing-safety-title">
        <p className="landing-eyebrow">Trust &amp; Safety</p>
        <h2 id="landing-safety-title">Verify the record. Follow official authorities.</h2>
        <p>Veridex is a consensus mirror for public NWS alert revisions. It does not provide dispatch, push monitoring, or life-safety guarantees. For real-time emergency decisions, always follow weather.gov and local civil authorities.</p>
      </section>

      <section className="landing-info" id="how-it-works">
        <p className="landing-eyebrow">How it works</p>
        <h2>Evidence in. Consensus. Operational truth out.</h2>
        <ol>
          <li><strong>Ingest</strong><span>Fetch a public NWS alert by canonical URN.</span></li>
          <li><strong>Verify</strong><span>Check identity, references, lineage, and semantic consequence.</span></li>
          <li><strong>Record</strong><span>Publish the accepted revision and its audit trail on GenLayer.</span></li>
        </ol>
      </section>

      <section className="landing-docs" id="docs">
        <div><p className="landing-eyebrow">Documentation</p><h2>Built for inspection.</h2></div>
        <div className="docs-links">
          <a href="https://docs.genlayer.com" target="_blank" rel="noreferrer">GenLayer documentation ↗</a>
          <button type="button" onClick={onEnterWorkspace}>Open the live workspace →</button>
        </div>
      </section>
    </main>
  </div>
);
