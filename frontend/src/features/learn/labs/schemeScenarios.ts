/**
 * Seven payment-scheme scenario quizzes for Lab 7.
 * Each scenario tests the learner's ability to choose the right rail.
 */

export interface SchemeScenario {
  id: string;
  question: string;
  options: Array<{
    id: string;
    label: string;
    correct: boolean;
    explanation: string;
  }>;
}

export const SCHEME_SCENARIOS: SchemeScenario[] = [
  {
    id: "q1-gbp-payroll",
    question: "A UK company pays 500 employees their monthly salaries in GBP. Which rail?",
    options: [
      { id: "a", label: "Faster Payments", correct: false, explanation: "FPS supports corporate batch files, but per-item cost (~£2.50) and per-bank file caps make it expensive for 500 salaries. Bacs is purpose-built for high-volume payroll at ~5-50p per item with scheduled delivery." },
      { id: "b", label: "Bacs Direct Credit", correct: true, explanation: "Correct! Bacs is designed for bulk payroll — batch processing, low cost, scheduled delivery." },
      { id: "c", label: "CHAPS", correct: false, explanation: "CHAPS is for high-value individual payments (£25+ per payment). Far too expensive for 500 salaries." },
    ],
  },
  {
    id: "q2-cad-dinner",
    question: "Splitting a CAD $50 dinner bill in Toronto. Which rail?",
    options: [
      { id: "a", label: "Interac e-Transfer", correct: true, explanation: "Correct! Interac e-Transfer is Canada's instant person-to-person payment rail." },
      { id: "b", label: "Wire transfer", correct: false, explanation: "Wire transfers cost $30+ and take hours. Far too expensive for a dinner bill." },
      { id: "c", label: "Lynx", correct: false, explanation: "Lynx is Canada's RTGS for high-value bank-to-bank transfers, not retail payments." },
    ],
  },
  {
    id: "q3-usd-treasury",
    question: "A corporation moves USD $50M between banks. Which rail?",
    options: [
      { id: "a", label: "ACH", correct: false, explanation: "ACH is for retail batch payments, not $50M movements. Too slow (1-2 business days)." },
      { id: "b", label: "Fedwire", correct: true, explanation: "Correct! Fedwire is the US RTGS for large-value, real-time, irrevocable transfers." },
      { id: "c", label: "RTP", correct: false, explanation: "RTP caps at $10M per payment (raised in 2025) — still well short of a $50M treasury move, and Fedwire is the purpose-built irrevocable RTGS rail." },
    ],
  },
  {
    id: "q4-india-vendor",
    question: "A street vendor in Mumbai accepts payment via QR code. Which rail?",
    options: [
      { id: "a", label: "NEFT", correct: false, explanation: "NEFT is batch-based and takes 30 minutes. Not instant enough for point-of-sale." },
      { id: "b", label: "UPI", correct: true, explanation: "Correct! UPI (Unified Payments Interface) is India's instant QR-based payment rail." },
      { id: "c", label: "RTGS", correct: false, explanation: "RTGS is for amounts ≥ ₹2 lakh. Too large for street vendor payments." },
    ],
  },
  {
    id: "q5-kenya-farmer",
    question: "An unbanked farmer in rural Kenya receives money from the city. Which rail?",
    options: [
      { id: "a", label: "EFT", correct: false, explanation: "EFT requires a bank account. The farmer is unbanked." },
      { id: "b", label: "M-Pesa", correct: true, explanation: "Correct! M-Pesa is Kenya's mobile money system — no bank account needed, works via SMS on basic phones." },
      { id: "c", label: "SWIFT", correct: false, explanation: "SWIFT is for bank-to-bank international transfers. The farmer has no bank." },
    ],
  },
  {
    id: "q6-eur-sepa",
    question: "Send EUR 10,000 from Germany to France, arriving next business day. Which rail?",
    options: [
      { id: "a", label: "SEPA Credit Transfer", correct: true, explanation: "Correct! SEPA CT settles within 1 business day across the eurozone." },
      { id: "b", label: "TARGET2", correct: false, explanation: "TARGET2 is RTGS for high-value instant settlement — overkill for €10K and costs more." },
      { id: "c", label: "SWIFT", correct: false, explanation: "SWIFT could work but SEPA is the purpose-built rail for eurozone retail payments." },
    ],
  },
  {
    id: "q7-uae-salaries",
    question: "A UAE company pays 200 employees in AED via the central bank system. Which rail?",
    options: [
      { id: "a", label: "UAEFTS", correct: true, explanation: "Correct! UAEFTS (UAE Funds Transfer System) is the central bank's batch transfer system for salaries and WPS." },
      { id: "b", label: "Direct debit", correct: false, explanation: "Direct debit pulls money FROM the account — it's for collecting bills, not paying salaries." },
      { id: "c", label: "Cash", correct: false, explanation: "Paying 200 employees in cash is impractical, insecure, and non-compliant with WPS regulations." },
    ],
  },
];
