/**
 * Notification helpers for import failures.
 * - Prefers Apps Script PropertiesService 'NOTIFY_EMAIL' when available
 * - Falls back to process.env.NOTIFY_EMAIL in CI / Node
 */
function getNotifyEmail() {
  try {
    if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
      return PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || null;
    }
  } catch (e) {
    // ignore
  }
  return typeof process !== "undefined" && process.env && process.env.NOTIFY_EMAIL
    ? process.env.NOTIFY_EMAIL
    : null;
}

function notifyImportFailure(workflowName, errorMessage) {
  try {
    const toEmail = getNotifyEmail();
    const body = `Workflow: ${workflowName}\nTime: ${new Date().toISOString()}\nError: ${String(
      errorMessage,
    )}\n`;

    if (!toEmail) {
      if (typeof Logger !== "undefined" && Logger.log) {
        Logger.log(`notifyImportFailure: no recipient; ${workflowName}: ${String(errorMessage)}`);
      } else if (typeof process !== "undefined" && process.stderr && process.stderr.write) {
        process.stderr.write(
          `notifyImportFailure: no recipient; ${workflowName}: ${String(errorMessage)}\n`,
        );
      }
      return;
    }

    if (typeof MailApp !== "undefined" && MailApp.sendEmail) {
      MailApp.sendEmail({ to: toEmail, subject: `⚠️ Budget Import Failed: ${workflowName}`, body });
      return;
    }

    // Node/CI fallback: best-effort log showing target recipient
    if (typeof Logger !== "undefined" && Logger.log) {
      Logger.log(`notifyImportFailure -> ${toEmail}: ${body}`);
    } else if (typeof process !== "undefined" && process.stderr && process.stderr.write) {
      process.stderr.write(`notifyImportFailure -> ${toEmail}: ${body}\n`);
    }
  } catch (e) {
    try {
      if (typeof Logger !== "undefined" && Logger.log)
        Logger.log(`notifyImportFailure error: ${e && e.message ? e.message : e}`);
    } catch (ee) {
      void ee;
    }
  }
}

module.exports = { getNotifyEmail, notifyImportFailure };
