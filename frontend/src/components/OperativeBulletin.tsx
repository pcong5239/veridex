import React, { useState } from 'react';
import { RevisionRecord, ChainRecord } from '../types';

interface OperativeBulletinProps {
  chain: ChainRecord | null;
  operativeRevision: RevisionRecord | null;
  isLoading: boolean;
}

export const OperativeBulletin: React.FC<OperativeBulletinProps> = ({
  chain,
  operativeRevision,
  isLoading,
}) => {
  const [copiedFingerprint, setCopiedFingerprint] = useState<string | null>(null);

  if (isLoading) {
    return (
      <section className="operative-bulletin" aria-label="Operative Alert Bulletin">
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-muted)', textAlign: 'center' }}>
          Loading operative alert record...
        </div>
      </section>
    );
  }

  if (!chain || !operativeRevision) {
    return (
      <section className="operative-bulletin" aria-label="Operative Alert Bulletin">
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-muted)', textAlign: 'center' }}>
          No alert chain selected. Select a channel or ingest an alert to inspect operative bulletin.
        </div>
      </section>
    );
  }

  const handleCopy = (label: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedFingerprint(label);
      setTimeout(() => setCopiedFingerprint(null), 2000);
    }
  };

  const getStatusClass = (status: RevisionRecord['operative_status']) => {
    switch (status) {
      case 'ACTIVE':
        return 'status-active';
      case 'CANCELLED':
        return 'status-cancelled';
      case 'EXPIRED':
        return 'status-expired';
      case 'HOLD_UNRESOLVED':
        return 'status-hold';
      default:
        return '';
    }
  };

  const getStatusBadge = (status: RevisionRecord['operative_status']) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge badge-active">ACTIVE ALERT</span>;
      case 'CANCELLED':
        return <span className="badge badge-error">ALERT CANCELLED</span>;
      case 'EXPIRED':
        return <span className="badge badge-draft">ALERT EXPIRED</span>;
      case 'HOLD_UNRESOLVED':
        return <span className="badge badge-warning">HOLD: CONFLICT UNRESOLVED</span>;
      case 'UPDATED':
        return <span className="badge badge-navy">SUPERSEDED / UPDATED</span>;
    }
  };

  const getInstructionBadge = (inst: RevisionRecord['instruction_change']) => {
    switch (inst) {
      case 'UNCHANGED':
        return <span className="badge badge-draft">INSTRUCTIONS UNCHANGED</span>;
      case 'NARROWED':
        return <span className="badge badge-navy">INSTRUCTIONS NARROWED</span>;
      case 'EXPANDED':
        return <span className="badge badge-warning">INSTRUCTIONS EXPANDED</span>;
      case 'REPLACED':
        return <span className="badge badge-active">INSTRUCTIONS REPLACED</span>;
      case 'REMOVED':
        return <span className="badge badge-error">INSTRUCTIONS REMOVED</span>;
      default:
        return <span className="badge badge-draft">INSTRUCTION UNKNOWN</span>;
    }
  };

  return (
    <article className={`operative-bulletin ${getStatusClass(operativeRevision.operative_status)}`} aria-label="Operative Alert Bulletin">
      <header className="bulletin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {getStatusBadge(operativeRevision.operative_status)}
          <span className="badge badge-navy">EPOCH {operativeRevision.epoch}</span>
          <span className="badge badge-navy">{operativeRevision.message_type.toUpperCase()}</span>
          {operativeRevision.severity && <span className="badge badge-draft">{operativeRevision.severity}</span>}
          {operativeRevision.urgency && <span className="badge badge-draft">{operativeRevision.urgency}</span>}
          {operativeRevision.certainty && <span className="badge badge-draft">{operativeRevision.certainty}</span>}
        </div>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
          Revision Index #{operativeRevision.revision_index} of {chain.revision_count}
        </div>
      </header>

      <h2 className="bulletin-headline">
        {operativeRevision.headline_excerpt || 'No Headline Excerpt Provided'}
      </h2>

      {/* Instruction Change Reason-Coded Band */}
      <section className="instruction-change-band" aria-label="Arbitrated Instruction Directives">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
          <span className="instruction-label">GenLayer AI Semantic Instruction Directive:</span>
          {getInstructionBadge(operativeRevision.instruction_change)}
        </div>
        <p className="instruction-text">
          {operativeRevision.instruction_text || 'No explicit public safety instructions provided in this revision.'}
        </p>
      </section>

      {/* Target Zones & Geographic Applicability */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Target UGC Zones ({operativeRevision.zones.length}):
        </span>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {operativeRevision.zones.map((zone) => (
            <span
              key={zone}
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
            >
              {zone}
            </span>
          ))}
        </div>
      </div>

      {/* ISO Timestamps */}
      <div className="bulletin-meta-row" style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
        <span>Sent: {operativeRevision.sent}</span>
        {operativeRevision.effective && <span>• Effective: {operativeRevision.effective}</span>}
        {operativeRevision.expires && <span>• Expires: {operativeRevision.expires}</span>}
      </div>

      {/* Source & Triple Cryptographic Fingerprints */}
      <footer className="bulletin-provenance">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
          <strong>Official National Weather Service Origin:</strong>
          {operativeRevision.source_url ? (
            <a
              href={operativeRevision.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-safety)', textDecoration: 'underline' }}
            >
              Inspect Source JSON (weather.gov) ↗
            </a>
          ) : (
            <span>None</span>
          )}
        </div>

        <div style={{ wordBreak: 'break-all' }}>
          <strong>Root URN:</strong> {operativeRevision.root_urn}
        </div>
        <div style={{ wordBreak: 'break-all' }}>
          <strong>Active URN:</strong> {operativeRevision.urn}
        </div>

        {operativeRevision.event_fingerprint && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ wordBreak: 'break-all' }}>
              <strong>Event SHA-256:</strong> {operativeRevision.event_fingerprint}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '1px 6px', fontSize: '10px' }}
              onClick={() => handleCopy('event', operativeRevision.event_fingerprint)}
            >
              {copiedFingerprint === 'event' ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {operativeRevision.instruction_fingerprint && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ wordBreak: 'break-all' }}>
              <strong>Instruction SHA-256:</strong> {operativeRevision.instruction_fingerprint}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '1px 6px', fontSize: '10px' }}
              onClick={() => handleCopy('instruction', operativeRevision.instruction_fingerprint)}
            >
              {copiedFingerprint === 'instruction' ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {operativeRevision.evidence_fingerprint && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ wordBreak: 'break-all' }}>
              <strong>Evidence SHA-256:</strong> {operativeRevision.evidence_fingerprint}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '1px 6px', fontSize: '10px' }}
              onClick={() => handleCopy('evidence', operativeRevision.evidence_fingerprint)}
            >
              {copiedFingerprint === 'evidence' ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </footer>
    </article>
  );
};
