import React from 'react';

export const SafetyDisclosures: React.FC = () => {
  return (
    <aside className="safety-banner" aria-label="Operational Safety Disclosures">
      <div>
        <strong>OPERATIONAL NOTICE:</strong> This application is a decentralized consensus mirror for NWS alert revisions on GenLayer. It does not provide push notifications, dispatch services, automated monitoring, or life-safety guarantees. Always follow official National Weather Service (weather.gov) and local civil authority directives for real-time emergency safety decisions.
      </div>
    </aside>
  );
};
