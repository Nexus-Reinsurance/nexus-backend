const bcrypt = require('bcryptjs');
const pool = require('./database');
const { getOrCreateCedent, upsertTreaty } = require('../lib/treatyStore');

const CEDENTS = [
  // [name, region, email, phone]
  ['Alpha Insurance', 'Europe', 'contact@alpha.com', '+1234567890'],
  ['Beta Reinsurance', 'Asia', 'contact@beta.com', '+1234567891'],
  ['Gamma Corp', 'Americas', 'contact@gamma.com', '+1234567892'],
];

// Renewal dates are relative to today so the dashboard's 30-day "upcoming renewals" is never stale.
// Loss ratio, risk level and recommendation are calculated by lib/treatyRules.js.
const TREATIES = [
  // [cedent, code, name, type, business line, earned premium, claims incurred, days until renewal]
  ['Alpha Insurance', 'TR-001', 'Property Quota Share', 'Quota Share', 'Property', 1000000, 880000, 20],
  ['Alpha Insurance', 'TR-002', 'Casualty Surplus', 'Surplus', 'Casualty', 1500000, 900000, 45],
  ['Beta Reinsurance', 'TR-003', 'Liability Excess of Loss', 'Excess of Loss', 'Liability', 2000000, 600000, 90],
  ['Gamma Corp', 'TR-004', 'Health Stop Loss', 'Stop Loss', 'Health', 800000, 750000, 10],
];

const seedDatabase = async () => {
  try {
    console.log('🌱 Seeding database...');

    // Create the demo user, or reset its password to DEMO_PASSWORD. Only the bcrypt hash is stored.
    if (!process.env.DEMO_PASSWORD) {
      throw new Error('DEMO_PASSWORD is not set. Add it to .env (see .env.example).');
    }
    await pool.query(
      `INSERT INTO app_user (first_name, last_name, role, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      ['Demo', 'User', 'analyst', 'demo@nexus.com', await bcrypt.hash(process.env.DEMO_PASSWORD, 10)]
    );

    const cedentIds = {};
    for (const [name, region, email, phone] of CEDENTS) {
      cedentIds[name] = await getOrCreateCedent(pool, { name, region, email, phone });
    }

    // Upsert by treaty_code: re-running resets the four demo treaties (and refreshes their dates).
    for (const [cedent, code, name, type, businessLine, earnedPremium, claimsIncurred, daysUntilRenewal] of TREATIES) {
      await upsertTreaty(pool, {
        cedentId: cedentIds[cedent], code, name, type, businessLine, earnedPremium, claimsIncurred, daysUntilRenewal,
      });
    }

    console.log('✅ Database seeded successfully!');
    console.log('   - User: demo@nexus.com');
    console.log(`   - Cedents: ${CEDENTS.length}`);
    console.log(`   - Treaties: ${TREATIES.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

seedDatabase();
