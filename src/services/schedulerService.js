const cron = require('node-cron');
const User = require('../models/User');
const { sendMorningSummary, sendEveningSummary, sendExpiryAlerts } = require('./alertService');

/**
 * Run a task for each user who has that hour:minute scheduled.
 * timeField = 'morningTime' | 'eveningTime'
 * taskFn = async (user) => {}
 */
async function runForMatchingUsers(timeField, taskFn) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hh}:${mm}`;

  const users = await User.find({
    isOnboarded: true,
    'notificationSettings.enabled': true,
    [`notificationSettings.${timeField}`]: currentTime
  });

  for (const user of users) {
    try {
      await taskFn(user);
    } catch (err) {
      console.error(`Scheduler error for ${user.phoneNumber}:`, err.message);
    }
  }
}

function initScheduler() {
  // Run every minute, check if any user has morning time = now
  cron.schedule('* * * * *', async () => {
    await runForMatchingUsers('morningTime', sendMorningSummary);
    await runForMatchingUsers('eveningTime', sendEveningSummary);
  });

  // Expiry check once a day at 6 AM
  cron.schedule('0 6 * * *', async () => {
    console.log('Running daily expiry alert check...');
    await sendExpiryAlerts();
  });

  console.log('📅 Scheduler initialised');
}

module.exports = { initScheduler };
