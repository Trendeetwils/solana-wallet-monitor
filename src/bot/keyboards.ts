import { Markup } from 'telegraf';

/**
 * Main menu keyboard
 */
export function getMainMenuKeyboard(isMonitoring: boolean) {
  const buttons = [
    [
      Markup.button.callback(
        isMonitoring ? '⏸ Stop Monitoring' : '✅ Start Monitoring',
        isMonitoring ? 'stop_monitoring' : 'start_monitoring'
      ),
    ],
    [
      Markup.button.callback('🔁 Change Address', 'change_address'),
      Markup.button.callback('ℹ️ Status', 'status'),
    ],
    [
      Markup.button.callback('⚙️ Settings', 'settings'),
    ],
  ];

  return Markup.inlineKeyboard(buttons);
}

/**
 * Settings menu keyboard
 */
export function getSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🎚 Commitment Level', 'setting_commitment'),
    ],
    [
      Markup.button.callback('⏱ Poll Interval', 'setting_interval'),
    ],
    [
      Markup.button.callback('◀️ Back to Menu', 'back_to_menu'),
    ],
  ]);
}

/**
 * Commitment level selection keyboard
 */
export function getCommitmentKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Processed', 'commit_processed'),
    ],
    [
      Markup.button.callback('Confirmed (recommended)', 'commit_confirmed'),
    ],
    [
      Markup.button.callback('Finalized', 'commit_finalized'),
    ],
    [
      Markup.button.callback('« Back', 'settings'),
    ],
  ]);
}

/**
 * Poll interval selection keyboard
 */
export function getPollIntervalKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('15 seconds', 'interval_15000'),
      Markup.button.callback('30 seconds', 'interval_30000'),
    ],
    [
      Markup.button.callback('1 minute', 'interval_60000'),
      Markup.button.callback('2 minutes', 'interval_120000'),
    ],
    [
      Markup.button.callback('◀️ Back', 'settings'),
    ],
  ]);
}

/**
 * Back to menu keyboard
 */
export function getBackToMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('◀️ Back to Menu', 'back_to_menu')],
  ]);
}
