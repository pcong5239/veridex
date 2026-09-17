import React from 'react';
import { ConfigRecord, UpgradeStatusRecord, AuditEventRecord } from '../types';

interface AuditAreaProps {
  config: ConfigRecord | null;
  upgradeStatus: UpgradeStatusRecord | null;
  auditEvents: AuditEventRecord[];
  isLoading: boolean;
}

export const AuditArea: React.FC<AuditAreaProps> = ({
  config,
  upgradeStatus,
  auditEvents,
  isLoading,
}) => {
  return (
    <section className="audit-area" aria-label="Auditor Ledger & System Diagnostics">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: 'var(--space-2)' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
          Contract Audit Trail & System Parameters
        </h2>
        {isLoading && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Updating audit data...</span>}
      </header>

      <div className="audit-grid">
        {/* Config Limits */}
        <div className="audit-block">
          <h3 className="audit-block-title">Contract Safety Limits</h3>
          {config ? (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              <li>Max Channels: {config.max_channels}</li>
              <li>Max Chains / Channel: {config.max_chains_per_channel}</li>
              <li>Max Revisions / Chain: {config.max_revisions_per_chain}</li>
              <li>Max Subscribers / Channel: {config.max_subscribers_per_channel}</li>
              <li>Zones / Channel: [{config.min_zones_per_channel}, {config.max_zones_per_channel}]</li>
              <li>Max Traversal Depth: {config.max_traversal_depth}</li>
              <li>Max Headline Excerpt: {config.max_headline_excerpt_length} chars</li>
              <li>Max NWS Body Size: {config.max_nws_response_body_size} bytes</li>
            </ul>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Config not loaded</div>
          )}
        </div>

        {/* Upgrade Status */}
        <div className="audit-block">
          <h3 className="audit-block-title">Governance & Upgrade Status</h3>
          {upgradeStatus ? (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              <li>Upgradable: {upgradeStatus.is_upgradable ? 'YES' : 'NO'}</li>
              <li>Contract Code Size: {upgradeStatus.code_size_bytes} bytes</li>
              <li>
                Authorized Upgraders ({upgradeStatus.upgraders.length}):
                <div style={{ marginTop: '2px', wordBreak: 'break-all', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {upgradeStatus.upgraders.join(', ') || 'None'}
                </div>
              </li>
            </ul>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Upgrade status not loaded</div>
          )}
        </div>

      </div>

      {/* Audit Events Table */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
          Channel Audit Events ({auditEvents.length})
        </h3>
        {auditEvents.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            No audit events recorded for the selected channel.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="audit-events-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Type</th>
                  <th>Epoch</th>
                  <th>Candidate URN</th>
                  <th>Root URN</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((evt, idx) => (
                  <tr key={`${evt.timestamp}-${idx}`}>
                    <td>{evt.timestamp}</td>
                    <td>
                      <span className="badge badge-navy">{evt.event_type}</span>
                    </td>
                    <td>{evt.epoch}</td>
                    <td title={evt.candidate_urn}>{evt.candidate_urn ? `${evt.candidate_urn.slice(0, 24)}...` : '-'}</td>
                    <td title={evt.root_urn}>{evt.root_urn ? `${evt.root_urn.slice(0, 24)}...` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
