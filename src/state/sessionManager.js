/**
 * sessionManager.js
 * In-memory session store with MongoDB persistence fallback.
 * Tracks each user's current conversation flow and step.
 */

const User = require('../models/User');

// In-memory cache keyed by phoneNumber
const sessions = {};

/**
 * Get a user's session state (from cache or DB)
 */
async function getSession(phoneNumber) {
  if (sessions[phoneNumber]) return sessions[phoneNumber];

  const user = await User.findOne({ phoneNumber });
  if (user && user.sessionState) {
    sessions[phoneNumber] = {
      currentFlow: user.sessionState.currentFlow || null,
      step: user.sessionState.step || null,
      tempData: user.sessionState.tempData || {},
    };
    return sessions[phoneNumber];
  }

  sessions[phoneNumber] = { currentFlow: null, step: null, tempData: {} };
  return sessions[phoneNumber];
}

/**
 * Update session state (in-memory + persist to DB)
 */
async function setSession(phoneNumber, updates) {
  if (!sessions[phoneNumber]) {
    sessions[phoneNumber] = { currentFlow: null, step: null, tempData: {} };
  }

  const oldSession = { ...sessions[phoneNumber] };
  sessions[phoneNumber] = {
    ...sessions[phoneNumber],
    ...updates,
    tempData: { ...sessions[phoneNumber].tempData, ...(updates.tempData || {}) },
  };

  console.log(`   📝 Session Updated: ${JSON.stringify(oldSession)} → ${JSON.stringify(sessions[phoneNumber])}`);

  // Persist to MongoDB
  await User.findOneAndUpdate(
    { phoneNumber },
    { $set: { sessionState: sessions[phoneNumber] } },
    { upsert: false }
  );

  return sessions[phoneNumber];
}

/**
 * Reset session state entirely
 */
async function clearSession(phoneNumber) {
  sessions[phoneNumber] = { currentFlow: null, step: null, tempData: {} };
  await User.findOneAndUpdate(
    { phoneNumber },
    { $set: { sessionState: { currentFlow: null, step: null, tempData: {} } } },
    { upsert: false }
  );
}

/**
 * Fully replace tempData (useful after collecting multiple fields)
 */
async function setTempData(phoneNumber, data) {
  if (!sessions[phoneNumber]) sessions[phoneNumber] = { currentFlow: null, step: null, tempData: {} };
  sessions[phoneNumber].tempData = { ...sessions[phoneNumber].tempData, ...data };
  await User.findOneAndUpdate(
    { phoneNumber },
    { $set: { 'sessionState.tempData': sessions[phoneNumber].tempData } },
    { upsert: false }
  );
}

module.exports = { getSession, setSession, clearSession, setTempData };
