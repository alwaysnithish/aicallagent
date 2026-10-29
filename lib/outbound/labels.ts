const L: Record<string, string> = {
  interested: "Interested", callback: "Call back", not_interested: "Not interested", booked: "Booked", wrong_number: "Wrong number",
  dnc: "Do not call", no_decision: "No decision", no_answer: "No answer", busy: "Busy", "no-answer": "No answer",
  failed: "Failed", canceled: "Canceled", dial_error: "Dial error", completed: "Completed",
};
export const label = (k?: string | null) => (k ? L[k] ?? k : "—");
export const tone = (k?: string | null) =>
  k === "interested" || k === "booked" ? "ok" : k === "callback" || k === "no_decision" ? "wn" : k === "dnc" || k === "failed" || k === "dial_error" ? "er" : "";
