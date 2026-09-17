import React from 'react';
import { RevisionRecord, AcknowledgementRecord } from '../types';

interface VerticalRevisionSpineProps {
  revisions: RevisionRecord[];
  activeRevisionIndex: number;
  acknowledgement: AcknowledgementRecord | null;
  onSelectRevision: (revisionIndex: number) => void;
  isLoading: boolean;
}

export const VerticalRevisionSpine: React.FC<VerticalRevisionSpineProps> = ({
  revisions,
  activeRevisionIndex,
  acknowledgement,
  onSelectRevision,
  isLoading,
}) => {
  if (isLoading && revisions.length === 0) {
    return (
      <section className="revision-spine" aria-label="Revision Timeline Spine">
        <div className="spine-header">
          <h2 className="spine-title">Revision History Spine</h2>
        </div>
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)', textAlign: 'center' }}>
          Loading revision lineage...
        </div>
      </section>
    );
  }

  if (revisions.length === 0) {
    return (
      <section className="revision-spine" aria-label="Revision Timeline Spine">
        <div className="spine-header">
          <h2 className="spine-title">Revision History Spine</h2>
        </div>
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)', textAlign: 'center' }}>
          No revision history available for this chain.
        </div>
      </section>
    );
  }

  return (
    <section className="revision-spine" aria-label="Revision Timeline Spine">
      <header className="spine-header">
        <h2 className="spine-title">Revision Lineage Spine</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {acknowledgement && (
            <span
              className={`badge ${
                acknowledgement.status === 'ACKNOWLEDGED'
                  ? 'badge-success'
                  : acknowledgement.status === 'STALE'
                  ? 'badge-warning'
                  : 'badge-draft'
              }`}
            >
              ACK: {acknowledgement.status} (Epoch {acknowledgement.acknowledged_epoch}/{acknowledgement.current_epoch})
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
            {revisions.length} Revisions
          </span>
        </div>
      </header>

      <div className="spine-timeline">
        {revisions.map((rev) => {
          const isSelected = rev.revision_index === activeRevisionIndex;
          return (
            <div
              key={`${rev.root_urn}-${rev.revision_index}`}
              className={`spine-node ${isSelected ? 'active' : ''}`}
            >
              <div className="spine-node-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong>Revision #{rev.revision_index}</strong>
                  <span className="badge badge-navy">{rev.message_type}</span>
                  <span className="badge badge-draft">Epoch {rev.epoch}</span>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => onSelectRevision(rev.revision_index)}
                >
                  {isSelected ? 'Viewing' : 'Inspect'}
                </button>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {rev.headline_excerpt || 'No excerpt'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                <span>Sent: {rev.sent}</span>
                {rev.parent_urn && (
                  <span title={rev.parent_urn} style={{ color: 'var(--text-muted)' }}>
                    • Parent: {rev.parent_urn.slice(0, 20)}...
                  </span>
                )}
                <span>• Directive: {rev.instruction_change}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
