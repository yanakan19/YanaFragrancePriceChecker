// The frontend's option-picker sends an explicit intent when the user picks
// a button. This is the fallback for free-typed messages.
export function classifyIntent(text) {
  const c = text.toLowerCase();
  if (/\bprice|cost|how much|cheapest|discount\b/.test(c)) return 'price';
  if (/\bnote|suggest|recommend|similar to|smells like\b/.test(c)) return 'suggest';
  return 'general';
}
