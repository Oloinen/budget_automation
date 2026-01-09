/**
 * Standardized workflow error type for Apps Script functions.
 */
function WorkflowError(message, code, details) {
  this.name = "WorkflowError";
  this.message = message || "Workflow error";
  this.code = code || "WORKFLOW_ERROR";
  this.details = details || null;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, WorkflowError);
  }
}
WorkflowError.prototype = Object.create(Error.prototype);
WorkflowError.prototype.constructor = WorkflowError;

// Helper to produce structured response when desired
function toResponse(err) {
  if (err instanceof WorkflowError) {
    return { success: false, error: err.message, code: err.code, details: err.details };
  }
  return { success: false, error: String(err) };
}

module.exports = { WorkflowError, toResponse };
