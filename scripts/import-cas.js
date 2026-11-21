// Imports the CAS Loss Reserving Database (NAIC Schedule P) as treaties. See README "Datasets".
// Usage: npm run import:cas                  downloads the pinned copy below
//        npm run import:cas -- ./clrd.csv    uses a local copy
const crypto = require('node:crypto');
const fs = require('node:fs');
const pool = require('../config/database');
const { calculateLossRatio, MAX_LOSS_RATIO } = require('../lib/treatyRules');
const { getOrCreateCedent, upsertTreaty } = require('../lib/treatyStore');

// Pinned to one commit of the chainladder-python repo (MPL-2.0) so every import sees the same data.
const SOURCE_URL =
  'https://raw.githubusercontent.com/casact/chainladder-python/46727b1fe5321b2d335cc92702e02de872e79f9d/chainladder/utils/data/clrd.csv';
const HEADER =
  'GRCODE,GRNAME,AccidentYear,DevelopmentYear,DevelopmentLag,IncurLoss,CumPaidLoss,BulkLoss,EarnedPremDIR,EarnedPremCeded,EarnedPremNet,Single,PostedReserve97,LOB';

// The file holds data as known at the end of 1997. Use the last 5 accident years at that evaluation.
const EVALUATION_YEAR = 1997;
const FIRST_ACCIDENT_YEAR = 1993;
const MIN_PREMIUM = 1000000; // USD; drops very small books

// CAS line of business -> [business_line, treaty_type]. CAS is insurer data, so treaty types are assigned.
const LINES = {
  ppauto: ['Personal Auto', 'Quota Share'],
  comauto: ['Commercial Auto', 'Quota Share'],
  wkcomp: ["Workers' Compensation", 'Excess of Loss'],
  medmal: ['Medical Malpractice', 'Excess of Loss'],
  prodliab: ['Product Liability', 'Excess of Loss'],
  othliab: ['Other Liability', 'Excess of Loss'],
};

const readSource = async (source) => {
  if (!/^https?:\/\//.test(source)) return fs.readFileSync(source, 'utf8');
  const res = await fetch(source);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${source}`);
  return res.text();
};

// Sums net earned premium and incurred losses (which include IBNR) per company and line.
// Amounts in the file are USD thousands.
const parseBooks = (text) => {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  if (header !== HEADER) throw new Error(`Unexpected CSV header: ${header}`);
  const books = new Map();
  let invalid = 0;
  for (const line of lines) {
    // The file has no quoted fields (checked via the header and field count), so a plain split is safe.
    const f = line.split(',');
    const [code, name, accidentYear, developmentYear] = f;
    const incurred = Number(f[5]);
    const premium = Number(f[10]);
    const lob = f[13];
    if (f.length !== 14 || !/^\d{1,5}$/.test(code) || !name || name.length > 100 ||
        !/^\d{4}$/.test(accidentYear) || !/^\d{4}$/.test(developmentYear) ||
        !Number.isFinite(incurred) || !Number.isFinite(premium) || !LINES[lob]) {
      invalid++;
      continue;
    }
    if (Number(developmentYear) !== EVALUATION_YEAR || Number(accidentYear) < FIRST_ACCIDENT_YEAR) continue;
    const key = `${code}-${lob}`;
    const book = books.get(key) ?? { code, name, lob, premium: 0, incurred: 0 };
    book.premium += premium * 1000;
    book.incurred += incurred * 1000;
    books.set(key, book);
  }
  return { books: [...books.values()], invalid };
};

// A stable 1..365 day offset per treaty: renewals spread over the next year and keep their place on re-import.
const daysUntilRenewal = (treatyCode) =>
  (crypto.createHash('sha256').update(treatyCode).digest().readUInt32BE(0) % 365) + 1;

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const importCas = async () => {
  const source = process.argv[2] || SOURCE_URL;
  console.log(`📥 Reading ${source}`);
  const { books, invalid } = parseBooks(await readSource(source));

  const usable = books.filter((b) => {
    const lossRatio = calculateLossRatio(b.premium, b.incurred);
    return b.premium >= MIN_PREMIUM && lossRatio !== null && lossRatio <= MAX_LOSS_RATIO;
  });

  // One transaction: a failed import leaves the database unchanged.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cedentIds = new Map();
    for (const b of usable) {
      if (!cedentIds.has(b.name)) {
        // .example is a reserved domain, so these synthetic addresses can never reach anyone.
        cedentIds.set(b.name, await getOrCreateCedent(client, {
          name: b.name, region: 'Americas', email: `reinsurance@${slug(b.name)}.example`,
        }));
      }
      const [businessLine, type] = LINES[b.lob];
      const code = `CAS-${b.code}-${b.lob}`;
      await upsertTreaty(client, {
        cedentId: cedentIds.get(b.name), code, name: `${businessLine} ${type}`, type, businessLine,
        earnedPremium: b.premium, claimsIncurred: b.incurred, daysUntilRenewal: daysUntilRenewal(code),
      });
    }
    await client.query('COMMIT');

    const byRisk = await client.query(
      `SELECT risk_level, COUNT(*)::int AS n FROM treaty WHERE treaty_code LIKE 'CAS-%'
       GROUP BY risk_level ORDER BY risk_level`
    );
    console.log(`✅ Imported ${usable.length} CAS treaties from ${cedentIds.size} cedents`);
    console.log(`   - Skipped ${invalid} invalid rows; dropped ${books.length - usable.length} books under $1M or without a usable loss ratio`);
    console.log(`   - Risk levels: ${byRisk.rows.map((r) => `${r.risk_level} ${r.n}`).join(', ')}`);
    process.exitCode = 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

importCas().catch((error) => {
  console.error('❌ CAS import failed:', error.message);
  process.exitCode = 1;
});
