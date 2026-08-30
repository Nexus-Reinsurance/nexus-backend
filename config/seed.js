const pool = require('./database');

const seedDatabase = async () => {
  try {
    console.log('🌱 Seeding database...');

    // Create demo user
    await pool.query(
      `INSERT INTO app_user (first_name, last_name, role, email) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      ['Demo', 'User', 'analyst', 'demo@nexus.com']
    );

    // Create cedents
    const cedentsResult = await pool.query(
      `INSERT INTO cedent (name, region, email, phone_number) 
       VALUES 
         ($1, $2, $3, $4),
         ($5, $6, $7, $8),
         ($9, $10, $11, $12)
       ON CONFLICT DO NOTHING
       RETURNING cedent_id`,
      [
        'Alpha Insurance', 'Europe', 'contact@alpha.com', '+1234567890',
        'Beta Reinsurance', 'Asia', 'contact@beta.com', '+1234567891',
        'Gamma Corp', 'Americas', 'contact@gamma.com', '+1234567892'
      ]
    );

    const cedents = cedentsResult.rows;

    if (cedents.length >= 3) {
      // Create treaties
      await pool.query(
        `INSERT INTO treaty 
         (cedent_id, name, treaty_code, treaty_type, business_line, 
          earned_premium, claims_incurred, loss_ratio, risk_level, recommendation,
          treaty_effective_date, treaty_renewal_date, treaty_status) 
         VALUES 
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13),
           ($14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26),
           ($27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39),
           ($40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52)
         ON CONFLICT (treaty_code) DO NOTHING`,
        [
          cedents[0].cedent_id, 'TR-001', 'TR-001', 'Quota Share', 'Property',
          1000000, 880000, 0.88, 'High', 'Review pricing',
          '2024-01-01', '2025-12-15', 'active',
          
          cedents[0].cedent_id, 'TR-002', 'TR-002', 'Surplus', 'Casualty',
          1500000, 900000, 0.60, 'Medium', 'Monitor performance',
          '2024-01-01', '2025-08-20', 'active',
          
          cedents[1].cedent_id, 'TR-003', 'TR-003', 'Excess of Loss', 'Liability',
          2000000, 600000, 0.30, 'Low', 'Good performance',
          '2024-01-01', '2025-09-10', 'active',
          
          cedents[2].cedent_id, 'TR-004', 'TR-004', 'Stop Loss', 'Health',
          800000, 750000, 0.9375, 'High', 'High loss ratio',
          '2024-01-01', '2025-11-01', 'active'
        ]
      );
    }

    console.log('✅ Database seeded successfully!');
    console.log('   - User: demo@nexus.com');
    console.log('   - Cedents: 3');
    console.log('   - Treaties: 4');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

seedDatabase();