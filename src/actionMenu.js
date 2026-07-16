const CLOSE_REASONS = new Set(["escape", "outside", "select"]);

export function getNextActionMenuState(currentState, action) {
  if (action === "toggle") return !currentState;
  if (CLOSE_REASONS.has(action)) return false;
  return currentState;
}
