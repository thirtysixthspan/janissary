// A page-wide order for user actions that must be compared across features: a reveal request and
// the file navigator presses that follow it. One counter, so the comparison never depends on clock
// resolution or on two clocks agreeing.
let lastOrder = 0;

export function nextInteractionOrder(): number {
  lastOrder += 1;
  return lastOrder;
}
