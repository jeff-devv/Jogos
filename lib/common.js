class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const round2 = (n) => Math.round(n * 100) / 100;
const MIN_BET = 1;
const MAX_BET = 1000;
const HISTORY_LIMIT = 20;
module.exports = { HttpError, round2, MIN_BET, MAX_BET, HISTORY_LIMIT };
