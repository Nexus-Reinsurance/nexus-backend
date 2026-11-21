const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLossRatio, classifyRisk, getRecommendation } = require('./treatyRules');

test('loss ratio is claims / premium, rounded to 4 decimals', () => {
  assert.equal(calculateLossRatio(800000, 750000), 0.9375);
  assert.equal(calculateLossRatio('1000000.00', '880000.00'), 0.88); // pg sends NUMERIC as strings
  assert.equal(calculateLossRatio(3, 1), 0.3333);
});

test('no loss ratio without a positive premium or with negative claims', () => {
  assert.equal(calculateLossRatio(0, 100), null);
  assert.equal(calculateLossRatio(-5, 1), null);
  assert.equal(calculateLossRatio(100, -1), null);
  assert.equal(calculateLossRatio('abc', 1), null);
});

test('risk: >= 80% High, >= 60% Medium, otherwise Low', () => {
  assert.equal(classifyRisk(0.5999), 'Low');
  assert.equal(classifyRisk(0.6), 'Medium');
  assert.equal(classifyRisk(0.7999), 'Medium');
  assert.equal(classifyRisk(0.8), 'High');
  assert.equal(classifyRisk(null), null);
});

test('rounding happens before classification', () => {
  const lossRatio = calculateLossRatio(100000, 79996); // 0.79996 is stored as 0.8000
  assert.equal(lossRatio, 0.8);
  assert.equal(classifyRisk(lossRatio), 'High');
});

test('recommendation gives the action and the reason', () => {
  assert.equal(
    getRecommendation(0.88),
    'Reprice or escalate: loss ratio 88.00% is at or above the 80% high-risk threshold.'
  );
  assert.equal(getRecommendation(0.6), 'Review terms: loss ratio 60.00% is between the 60% and 80% thresholds.');
  assert.equal(getRecommendation(0.3), 'Renew: loss ratio 30.00% is below the 60% threshold.');
  assert.equal(getRecommendation(null), null);
});
