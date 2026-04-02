/**
 * navHelper.js
 * Shared utilities for back/home navigation across all flows.
 */

/**
 * Standard nav footer appended to every user-facing message.
 * Keeps it short so it doesn't clutter the main content.
 */
const NAV_FOOTER = `\n\n↩️ _Type *back* to go back  |  🏠 Type *home* to main menu_`;

/**
 * Append the nav footer to any message string.
 */
function withNav(msg) {
  return msg + NAV_FOOTER;
}

/**
 * Check if the message is a BACK command.
 * Handles: back, peeche, wapas, go back, prev, previous
 */
function isBack(text) {
  return /^(back|peeche|wapas|go back|prev|previous)$/i.test(text.trim());
}

/**
 * Check if the message is a HOME / menu command.
 * Handles: home, menu, main, main menu, ghar, shuru, start
 */
function isHome(text) {
  return /^(home|menu|main|main menu|ghar|shuru|start)$/i.test(text.trim());
}

module.exports = { withNav, isBack, isHome, NAV_FOOTER };
