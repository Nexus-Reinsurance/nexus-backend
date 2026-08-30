// Temporary mock data until PostgreSQL is ready
const mockData = {
  users: [
  {
    id: 1,
    name: 'Demo User',
    email: 'demo@nexus.com',
    password: '$2b$10$6Z3ycAtX3yHglXUryiiaEOTZRRAWbufPOAffnO3BUu5RGf9J2vyO2',
    role: 'analyst'
  }
],
  cedents: [
    { id: 1, name: 'Alpha Insurance', contact_info: 'contact@alpha.com', status: 'active' },
    { id: 2, name: 'Beta Reinsurance', contact_info: 'contact@beta.com', status: 'active' },
    { id: 3, name: 'Gamma Corp', contact_info: 'contact@gamma.com', status: 'active' }
  ],
  treaties: [
    {
      id: 1,
      name: 'TR-001',
      cedent_id: 1,
      treaty_type: 'Quota Share',
      cession_percentage: 70,
      retention: 30,
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      renewal_date: '2025-12-15',
      status: 'active'
    },
    {
      id: 2,
      name: 'TR-002',
      cedent_id: 1,
      treaty_type: 'Surplus',
      retention: 500000,
      limit_amount: 2000000,
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      renewal_date: '2025-08-20',
      status: 'active'
    },
    {
      id: 3,
      name: 'TR-003',
      cedent_id: 2,
      treaty_type: 'Excess of Loss',
      retention: 500000,
      limit_amount: 1000000,
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      renewal_date: '2025-09-10',
      status: 'active'
    },
    {
      id: 4,
      name: 'TR-004',
      cedent_id: 3,
      treaty_type: 'Stop Loss',
      attachment_loss_ratio: 100,
      limit_loss_ratio: 120,
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      renewal_date: '2025-11-01',
      status: 'active'
    }
  ],
  premiums: [
    { id: 1, treaty_id: 1, reporting_period: '2024', written_premium: 1000000, earned_premium: 1000000, currency: 'EUR' },
    { id: 2, treaty_id: 2, reporting_period: '2024', written_premium: 1500000, earned_premium: 1500000, currency: 'EUR' },
    { id: 3, treaty_id: 3, reporting_period: '2024', written_premium: 2000000, earned_premium: 2000000, currency: 'EUR' },
    { id: 4, treaty_id: 4, reporting_period: '2024', written_premium: 800000, earned_premium: 800000, currency: 'EUR' }
  ],
  claims: [
    { id: 1, treaty_id: 1, reporting_period: '2024', claim_amount: 880000, claim_status: 'paid', claim_date: '2024-06-15', claim_type: 'large' },
    { id: 2, treaty_id: 2, reporting_period: '2024', claim_amount: 900000, claim_status: 'paid', claim_date: '2024-07-20', claim_type: 'medium' },
    { id: 3, treaty_id: 3, reporting_period: '2024', claim_amount: 600000, claim_status: 'paid', claim_date: '2024-05-10', claim_type: 'small' },
    { id: 4, treaty_id: 4, reporting_period: '2024', claim_amount: 750000, claim_status: 'pending', claim_date: '2024-08-01', claim_type: 'medium' }
  ],
  renewals: [
    { id: 1, treaty_id: 1, renewal_year: 2025, proposed_premium: 1200000, renewal_status: 'pending', review_notes: 'Review required' },
    { id: 2, treaty_id: 2, renewal_year: 2025, proposed_premium: 1800000, renewal_status: 'pending', review_notes: 'Awaiting approval' },
    { id: 3, treaty_id: 3, renewal_year: 2025, proposed_premium: 2200000, renewal_status: 'pending', review_notes: 'Under review' },
    { id: 4, treaty_id: 4, renewal_year: 2025, proposed_premium: 950000, renewal_status: 'pending', review_notes: 'Pending decision' }
  ]
};

module.exports = mockData;