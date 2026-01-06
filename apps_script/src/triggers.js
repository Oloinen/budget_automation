// Trigger management: install/remove idempotent time-driven triggers and provide wrappers.

/*
  SCHEDULE_CONFIG examples:
  - minutes: { handler, type: 'minutes', every: 5 }
  - hours:   { handler, type: 'hours', every: 1 }
  - daily:   { handler, type: 'daily', hour: 2 } // 2 = 02:00
*/
var SCHEDULE_CONFIG = [
  { handler: 'runCreditCardImportWrapper', type: 'hours', every: 1 },
  { handler: 'runDailySummaryWrapper', type: 'daily', hour: 3 }
];

function installTriggers() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < SCHEDULE_CONFIG.length; i++) {
    var cfg = SCHEDULE_CONFIG[i];
    var exists = false;
    for (var j = 0; j < existing.length; j++) {
      if (existing[j].getHandlerFunction() === cfg.handler) { exists = true; break; }
    }
    if (exists) continue;
    try {
      createTriggerFromConfig(cfg);
      Logger.log('Created trigger for %s', cfg.handler);
    } catch (e) {
      Logger.log('Failed to create trigger for %s: %s', cfg.handler, e);
    }
  }
}

function removeTriggers() {
  var handlers = SCHEDULE_CONFIG.map(function(c){ return c.handler; });
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
      Logger.log('Deleted trigger for %s', t.getHandlerFunction());
    }
  }
}

function listInstalledTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var names = [];
  for (var i = 0; i < triggers.length; i++) names.push(triggers[i].getHandlerFunction());
  return names;
}

function createTriggerFromConfig(cfg) {
  var builderBase = ScriptApp.newTrigger(cfg.handler).timeBased();
  switch (cfg.type) {
    case 'minutes':
      if (!cfg.every) throw new Error('minutes requires every');
      builderBase.everyMinutes(cfg.every).create();
      break;
    case 'hours':
      if (!cfg.every) cfg.every = 1;
      builderBase.everyHours(cfg.every).create();
      break;
    case 'daily':
      var hour = (typeof cfg.hour === 'number') ? cfg.hour : 1;
      builderBase.atHour(hour).everyDays(cfg.every || 1).create();
      break;
    case 'weekly':
      if (!cfg.weekDay) throw new Error('weekly requires weekDay');
      var wd = ScriptApp.WeekDay[cfg.weekDay.toUpperCase()];
      builderBase.onWeekDay(wd).atHour(cfg.hour || 1).create();
      break;
    case 'monthly':
      if (!cfg.day) throw new Error('monthly requires day (1-31)');
      builderBase.onMonthDay(cfg.day).atHour(cfg.hour || 1).create();
      break;
    default:
      throw new Error('Unknown schedule type: ' + cfg.type);
  }
}

/* Recommended wrapper pattern: use LockService and minimal error handling.
   Register the wrapper functions (not the raw job functions) in SCHEDULE_CONFIG. */

function runCreditCardImportWrapper() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000 * 60)) { Logger.log('runCreditCardImport already running'); return; }
  try {
    if (typeof runCreditCardImport === 'function') {
      runCreditCardImport();
    } else {
      Logger.log('runCreditCardImport not defined');
    }
  } catch (e) {
    Logger.log('runCreditCardImport error: %s', e);
    // optionally notify via email / webhook
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function runDailySummaryWrapper() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000 * 60)) { Logger.log('runDailySummary already running'); return; }
  try {
    if (typeof runDailySummary === 'function') {
      runDailySummary();
    } else {
      Logger.log('runDailySummary not defined');
    }
  } catch (e) {
    Logger.log('runDailySummary error: %s', e);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
