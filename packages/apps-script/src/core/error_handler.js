/**
 * Error handling adapter for workflow entrypoints.
 * Provides consistent error handling, logging, and notification across all workflows.
 *
 * Usage:
 *   function myWorkflow(deps) {
 *     return handleWorkflowErrors('MyWorkflow', deps, () => {
 *       // workflow implementation
 *       return { success: true, ... };
 *     });
 *   }
 */

const { WorkflowError, toResponse } = require("./errors");
const { notifyImportFailure } = require("./notification_utils");

/**
 * Wraps a workflow function with standardized error handling.
 *
 * @param {string} workflowName - Name of the workflow for logging/notifications
 * @param {Object} deps - Dependencies object (for testing, may include custom Logger)
 * @param {Function} workflowFn - The workflow function to execute
 * @returns {Object} Structured response: { success, error?, code?, details? }
 */
function handleWorkflowErrors(workflowName, deps, workflowFn) {
  try {
    const result = workflowFn();

    // If the workflow returned a structured result, forward it
    if (result && typeof result === "object" && "success" in result) {
      return result;
    }

    // Default success response
    return { success: true };
  } catch (err) {
    // Log the error
    logError(workflowName, err, deps);

    // Send notification (best effort, don't let notification failures break the response)
    try {
      notifyImportFailure(workflowName, err && err.message ? err.message : String(err));
    } catch (e) {
      // Notification failed, but don't let it break the error response
      void e;
    }

    // Return structured error response
    if (err instanceof WorkflowError) {
      return toResponse(err);
    }

    return toResponse(new WorkflowError(String(err), "EXECUTION_ERROR", { original: err }));
  }
}

/**
 * Logs an error with context.
 * @param {string} workflowName - Name of the workflow
 * @param {Error} err - The error object
 * @param {Object} deps - Dependencies (may include Logger)
 */
function logError(workflowName, err, deps) {
  const Logger = deps?.Logger || globalThis.Logger;
  const message = `${workflowName} error: ${err && err.message ? err.message : String(err)}`;

  if (Logger && Logger.log) {
    Logger.log(message);
    if (err && err.stack) {
      Logger.log(`Stack: ${err.stack}`);
    }
  } else if (typeof console !== "undefined" && console.error) {
    console.error(message);
    if (err && err.stack) {
      console.error(err.stack);
    }
  }
}

/**
 * Creates a WorkflowError with quota exceeded details.
 * Common pattern for API quota guard failures.
 *
 * @param {string} workflowName - Name of the workflow
 * @param {Error} originalError - The original quota error
 * @returns {WorkflowError}
 */
function createQuotaError(workflowName, originalError) {
  return new WorkflowError(
    `Aborting ${workflowName} due to quota guard: ${String(originalError)}`,
    "QUOTA_EXCEEDED",
    { original: originalError },
  );
}

module.exports = {
  handleWorkflowErrors,
  logError,
  createQuotaError,
};
