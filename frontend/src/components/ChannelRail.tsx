import React from 'react';
import { ChannelRecord } from '../types';

interface ChannelRailProps {
  channels: ChannelRecord[];
  selectedChannelId: number | null;
  onSelectChannel: (channelId: number) => void;
  isLoading: boolean;
}

export const ChannelRail: React.FC<ChannelRailProps> = ({
  channels,
  selectedChannelId,
  onSelectChannel,
  isLoading,
}) => {
  const getStatusBadge = (status: ChannelRecord['status']) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge badge-active">ACTIVE</span>;
      case 'DRAFT':
        return <span className="badge badge-draft">DRAFT</span>;
      case 'CLOSED':
        return <span className="badge badge-closed">CLOSED</span>;
    }
  };

  return (
    <nav className="channel-rail" aria-label="Alert Channels Rail">
      <div className="channel-rail-header">
        <h2 className="rail-title">Alert Channels</h2>
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {channels.length} Total
        </span>
      </div>

      {isLoading && channels.length === 0 ? (
        <div style={{ padding: 'var(--space-3)', fontSize: '12px', color: 'var(--text-muted)' }}>
          Querying channels...
        </div>
      ) : channels.length === 0 ? (
        <div style={{ padding: 'var(--space-3)', fontSize: '12px', color: 'var(--text-muted)' }}>
          No channels registered on-chain yet.
        </div>
      ) : (
        <ul className="channel-list">
          {channels.map((channel) => {
            const isSelected = channel.channel_id === selectedChannelId;
            return (
              <li key={channel.channel_id}>
                <button
                  type="button"
                  className={`channel-card ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectChannel(channel.channel_id)}
                  aria-pressed={isSelected}
                >
                  <div className="channel-card-top">
                    <span className="channel-name">
                      #{channel.channel_id} {channel.name}
                    </span>
                    {getStatusBadge(channel.status)}
                  </div>

                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {channel.zones.map((zone) => (
                      <span
                        key={zone}
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          padding: '1px 4px',
                          borderRadius: 'var(--radius-sm)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                        }}
                      >
                        {zone}
                      </span>
                    ))}
                  </div>

                  <div className="channel-meta">
                    <span>{channel.chain_count} chains</span>
                    <span>•</span>
                    <span>{channel.subscriber_count} subs</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
};
