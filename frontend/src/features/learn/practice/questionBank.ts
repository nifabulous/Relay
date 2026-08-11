/**
 * The practice question bank.
 *
 * Every question is tagged with the module that teaches it, so the daily
 * drill only ever asks about material the learner has completed. Question
 * ids are stable — the spaced-review queue stores them across sessions.
 */

export interface PracticeOption {
  id: string;
  label: string;
  correct: boolean;
  explanation: string;
}

export interface PracticeQuestion {
  id: string;
  moduleId: string;
  question: string;
  options: PracticeOption[];
}

export const QUESTION_BANK: PracticeQuestion[] = [
  // ── Lab 1: BICs & IBANs ──
  {
    id: "l1-bic-country",
    moduleId: "lab-1",
    question: "In the BIC GTBINGLAXXX, which characters tell you the country?",
    options: [
      { id: "a", label: "GTBI (positions 1–4)", correct: false, explanation: "The first four characters are the bank code, not the country." },
      { id: "b", label: "NG (positions 5–6)", correct: true, explanation: "Positions 5–6 are the ISO country code — NG is Nigeria." },
      { id: "c", label: "LA (positions 7–8)", correct: false, explanation: "Positions 7–8 are the location code within the country." },
      { id: "d", label: "XXX (positions 9–11)", correct: false, explanation: "The last three characters identify the branch (XXX = head office)." },
    ],
  },
  {
    id: "l1-iban-vs-bic",
    moduleId: "lab-1",
    question: "A payment instruction needs to identify both a bank and a specific account. Which pair does that?",
    options: [
      { id: "a", label: "BIC for the bank, IBAN for the account", correct: true, explanation: "The BIC routes to a bank (and branch); the IBAN pins down the exact account, and embeds the bank code too." },
      { id: "b", label: "IBAN for the bank, BIC for the account", correct: false, explanation: "It's the other way around — the BIC never identifies an individual account." },
      { id: "c", label: "Two BICs", correct: false, explanation: "A BIC contains no account information at all." },
      { id: "d", label: "Two IBANs", correct: false, explanation: "IBANs identify accounts; correspondent routing still needs the bank-level BIC." },
    ],
  },
  {
    id: "l1-iban-checksum-pos",
    moduleId: "lab-1",
    question: "In GB29NWBK60161331926819, what does '29' represent?",
    options: [
      { id: "a", label: "The branch number", correct: false, explanation: "Branch information lives further into the BBAN, not in positions 3–4." },
      { id: "b", label: "The check digits", correct: true, explanation: "Positions 3–4 of every IBAN are the MOD-97 check digits." },
      { id: "c", label: "The account type", correct: false, explanation: "IBANs don't encode account type." },
      { id: "d", label: "The country sub-code", correct: false, explanation: "The country is fully identified by 'GB'; '29' is the checksum." },
    ],
  },

  // ── Lab 2: MOD-97 ──
  {
    id: "l2-why-97",
    moduleId: "lab-2",
    question: "What does a valid MOD-97 result equal for a correct IBAN?",
    options: [
      { id: "a", label: "0", correct: false, explanation: "Close — the rearranged number mod 97 must equal 1, not 0." },
      { id: "b", label: "1", correct: true, explanation: "After moving the first four characters to the end and converting letters to numbers, a valid IBAN mod 97 equals exactly 1." },
      { id: "c", label: "97", correct: false, explanation: "A remainder can never equal the divisor." },
      { id: "d", label: "The country code value", correct: false, explanation: "The check is a fixed remainder of 1 regardless of country." },
    ],
  },
  {
    id: "l2-typo-catch",
    moduleId: "lab-2",
    question: "You transpose two digits in an IBAN when typing it. What will MOD-97 validation almost certainly do?",
    options: [
      { id: "a", label: "Fail the IBAN before any money moves", correct: true, explanation: "Catching transpositions and single-digit typos before submission is exactly what the checksum is for." },
      { id: "b", label: "Pass it — checksums only catch missing digits", correct: false, explanation: "MOD-97 catches transposed and mistyped digits with near-certainty (~99.99%)." },
      { id: "c", label: "Route the payment to a different valid account", correct: false, explanation: "A checksum failure stops validation; it never silently reroutes." },
      { id: "d", label: "Correct the typo automatically", correct: false, explanation: "The checksum detects errors; it cannot repair them." },
    ],
  },
  {
    id: "l2-letters",
    moduleId: "lab-2",
    question: "During MOD-97 validation, what happens to the letters in an IBAN?",
    options: [
      { id: "a", label: "They're removed before computing", correct: false, explanation: "Dropping them would destroy the information they carry." },
      { id: "b", label: "Each letter converts to a number (A=10 … Z=35)", correct: true, explanation: "Letters map to 10–35, producing one long number for the mod-97 computation." },
      { id: "c", label: "They're compared alphabetically", correct: false, explanation: "MOD-97 is pure integer arithmetic." },
      { id: "d", label: "Only the country letters are used", correct: false, explanation: "Every letter in the IBAN participates in the calculation." },
    ],
  },

  // ── Lab 3: VoP ──
  {
    id: "l3-close-match",
    moduleId: "lab-3",
    question: "VoP returns CLOSE_MATCH and shows the real account holder name. Why does it reveal the name?",
    options: [
      { id: "a", label: "So you can confirm with your payee before sending", correct: true, explanation: "The reveal exists to let you check with the payee through a trusted channel — the human step that prevents misdirected payments." },
      { id: "b", label: "As a courtesy — the payment proceeds regardless", correct: false, explanation: "A CLOSE_MATCH calls for review, not automatic proceeding." },
      { id: "c", label: "To let you auto-correct the name and resend", correct: false, explanation: "Silently substituting the returned name defeats the point of verification." },
      { id: "d", label: "It's a data leak — banks shouldn't do this", correct: false, explanation: "The disclosure is deliberate and regulated, scoped to close matches only." },
    ],
  },
  {
    id: "l3-no-match-action",
    moduleId: "lab-3",
    question: "Which VoP outcome should stop a payment outright?",
    options: [
      { id: "a", label: "CLOSE_MATCH", correct: false, explanation: "CLOSE_MATCH means review and confirm — often just a typo." },
      { id: "b", label: "NOT_CHECKED", correct: false, explanation: "NOT_CHECKED means no comparison happened; you proceed with your own diligence." },
      { id: "c", label: "NO_MATCH", correct: true, explanation: "NO_MATCH means the name and account genuinely disagree — the classic invoice-fraud signal." },
      { id: "d", label: "MATCH", correct: false, explanation: "MATCH is the green light." },
    ],
  },
  {
    id: "l3-why-vop",
    moduleId: "lab-3",
    question: "What class of fraud is Verification of Payee primarily designed to stop?",
    options: [
      { id: "a", label: "Card skimming", correct: false, explanation: "Card fraud is a different rail entirely." },
      { id: "b", label: "Invoice redirection / authorized push payment fraud", correct: false, explanation: "Very close — but the mechanism is name-vs-account mismatch. Choose the more specific answer." },
      { id: "c", label: "Payments sent to an account the named payee doesn't own", correct: true, explanation: "VoP checks the name against the account holder, catching redirected invoices and mistyped accounts alike." },
      { id: "d", label: "Currency counterfeiting", correct: false, explanation: "Not related to electronic credit transfers." },
    ],
  },

  // ── Lab 4: Correspondent routing ──
  {
    id: "l4-nostro",
    moduleId: "lab-4",
    question: "From YOUR bank's perspective, what is a Nostro account?",
    options: [
      { id: "a", label: "Our account, held at another bank, in their currency", correct: true, explanation: "Nostro = 'ours with you'. Your bank's USD Nostro is its dollar account at a US correspondent." },
      { id: "b", label: "Another bank's account held with us", correct: false, explanation: "That's the Vostro — same account, seen from the other side." },
      { id: "c", label: "A customer's foreign-currency account", correct: false, explanation: "Nostro/Vostro are interbank accounts, not customer accounts." },
      { id: "d", label: "A central-bank reserve account", correct: false, explanation: "Reserve accounts are with the central bank; Nostros are commercial relationships." },
    ],
  },
  {
    id: "l4-why-hops",
    moduleId: "lab-4",
    question: "Why does a payment from a Nigerian bank to a Japanese bank often pass through a US intermediary?",
    options: [
      { id: "a", label: "US regulators require it", correct: false, explanation: "No rule forces the route — account relationships do." },
      { id: "b", label: "The two banks hold no direct account relationship, but both have USD correspondents", correct: true, explanation: "Money moves along the chain of actual account relationships; a shared USD correspondent bridges the gap." },
      { id: "c", label: "SWIFT messages can only travel via the US", correct: false, explanation: "SWIFT messages go anywhere; it's the settlement that needs account relationships." },
      { id: "d", label: "It's always cheaper", correct: false, explanation: "Extra hops add fees — banks route this way out of necessity, not economy." },
    ],
  },
  {
    id: "l4-message-vs-money",
    moduleId: "lab-4",
    question: "In correspondent banking, what actually 'moves' between banks at each hop?",
    options: [
      { id: "a", label: "Physical currency via courier", correct: false, explanation: "No cash moves in correspondent banking." },
      { id: "b", label: "Account balances: debits and credits across Nostro/Vostro accounts", correct: true, explanation: "Each hop is a ledger entry — the correspondent debits one account and credits another. The 'movement' is bookkeeping." },
      { id: "c", label: "Cryptographic tokens", correct: false, explanation: "Traditional correspondent banking is ledger entries, not tokens." },
      { id: "d", label: "The SWIFT message carries the funds", correct: false, explanation: "The message is an instruction; settlement happens separately on the accounts." },
    ],
  },

  // ── Lab 5: SSI ──
  {
    id: "l5-ssi-purpose",
    moduleId: "lab-5",
    question: "What question does a Standard Settlement Instruction answer?",
    options: [
      { id: "a", label: "Which correspondent and Nostro account to use for a given bank and currency", correct: true, explanation: "SSI = per-bank, per-currency routing: which correspondent to pay, into which account, under which charge code." },
      { id: "b", label: "Whether the beneficiary name matches the account", correct: false, explanation: "That's Verification of Payee." },
      { id: "c", label: "Whether the IBAN checksum is valid", correct: false, explanation: "That's MOD-97 validation." },
      { id: "d", label: "What time the payment will arrive", correct: false, explanation: "Timing comes from value dates and scheme cut-offs, not the SSI's core purpose." },
    ],
  },
  {
    id: "l5-our-code",
    moduleId: "lab-5",
    question: "A contract requires the beneficiary to receive the exact invoiced amount. Which charge code?",
    options: [
      { id: "a", label: "SHA", correct: false, explanation: "SHA lets intermediaries deduct fees from the amount in flight." },
      { id: "b", label: "BEN", correct: false, explanation: "BEN deducts the most — even the sender's own fee comes out of the amount." },
      { id: "c", label: "OUR", correct: true, explanation: "OUR bills all fees back to the sender, so the full amount arrives." },
      { id: "d", label: "Any — fees never affect the principal", correct: false, explanation: "Under SHA and BEN, fees come straight out of the principal." },
    ],
  },
  {
    id: "l5-wrong-ssi",
    moduleId: "lab-5",
    question: "You send USD for a UAE bank to a correspondent NOT listed in its SSI. The most likely outcome is:",
    options: [
      { id: "a", label: "Instant rejection", correct: false, explanation: "There's no instant global rejection in correspondent banking." },
      { id: "b", label: "Delay, manual repair, and possible investigation fees", correct: true, explanation: "The funds land where the beneficiary bank holds no Nostro — humans must find and reroute them." },
      { id: "c", label: "Automatic forwarding at no cost", correct: false, explanation: "Rerouting is manual and usually billed." },
      { id: "d", label: "Nothing — any USD bank works", correct: false, explanation: "The published SSI exists precisely because it matters where the money lands." },
    ],
  },

  // ── Lab 6: UETR / tracking ──
  {
    id: "l6-uetr",
    moduleId: "lab-6",
    question: "What is a UETR?",
    options: [
      { id: "a", label: "A unique end-to-end ID that follows one payment through every hop", correct: true, explanation: "The 36-character UUID assigned at creation lets SWIFT gpi trace the payment across all banks in the chain." },
      { id: "b", label: "The beneficiary's account number", correct: false, explanation: "The UETR identifies the payment, not any account." },
      { id: "c", label: "A per-bank reference that changes at each hop", correct: false, explanation: "Its whole value is that it does NOT change between hops." },
      { id: "d", label: "The SWIFT message type", correct: false, explanation: "Message types are things like MT103/pacs.008; the UETR is a transaction identifier." },
    ],
  },
  {
    id: "l6-terminal",
    moduleId: "lab-6",
    question: "Which tracking status is terminal — the payment journey is over?",
    options: [
      { id: "a", label: "In progress at intermediary", correct: false, explanation: "The payment is still moving." },
      { id: "b", label: "Credited to beneficiary", correct: true, explanation: "Once credited (or rejected), the journey has ended; everything before that is in flight." },
      { id: "c", label: "Received by beneficiary bank", correct: false, explanation: "Received isn't credited — funds can sit pending checks." },
      { id: "d", label: "Sent by originator bank", correct: false, explanation: "That's the very first event." },
    ],
  },
  {
    id: "l6-fee-read",
    moduleId: "lab-6",
    question: "A gpi tracker shows $1,000 sent and $978.50 credited. What explains the difference?",
    options: [
      { id: "a", label: "FX conversion", correct: false, explanation: "Same currency both ends here — the deduction is fees, not conversion." },
      { id: "b", label: "Fees deducted by banks along the chain", correct: true, explanation: "Under SHA/BEN, each intermediary lifts its fee from the amount; the tracker shows the cumulative deduction." },
      { id: "c", label: "A tracking error", correct: false, explanation: "Deducted fees are reported per hop by gpi — this is normal, visible behavior." },
      { id: "d", label: "Rounding", correct: false, explanation: "$21.50 is far beyond rounding." },
    ],
  },

  // ── Lab 7: Payment schemes ──
  {
    id: "l7-rtgs",
    moduleId: "lab-7",
    question: "What distinguishes an RTGS system like CHAPS or Fedwire from a batch system?",
    options: [
      { id: "a", label: "Each payment settles individually and finally, in real time", correct: true, explanation: "RTGS = real-time gross settlement: no netting, no waiting for a cycle, no settlement risk between participants." },
      { id: "b", label: "Payments are netted and settled at day's end", correct: false, explanation: "That's deferred net settlement — the opposite." },
      { id: "c", label: "It's only for retail payments", correct: false, explanation: "RTGS is the high-value backbone; retail usually rides cheaper rails." },
      { id: "d", label: "It's always free", correct: false, explanation: "RTGS payments typically cost the most." },
    ],
  },
  {
    id: "l7-speed-cost",
    moduleId: "lab-7",
    question: "A company runs monthly payroll for 5,000 staff. Which rail choice reflects the golden rule of schemes?",
    options: [
      { id: "a", label: "RTGS for every salary — fastest is best", correct: false, explanation: "Paying RTGS fees 5,000 times for non-urgent transfers wastes money." },
      { id: "b", label: "A batch/ACH-style rail scheduled ahead of payday", correct: true, explanation: "Speed costs money. Payroll is predictable, so the slow cheap rail is the right call." },
      { id: "c", label: "Instant payments, one by one, on payday morning", correct: false, explanation: "Instant rails often carry per-transaction limits and higher costs — wrong fit for bulk scheduled payments." },
      { id: "d", label: "Cheques", correct: false, explanation: "Slow, manual, and disappearing." },
    ],
  },
  {
    id: "l7-limits",
    moduleId: "lab-7",
    question: "Why might a £2m property completion NOT go over UK Faster Payments?",
    options: [
      { id: "a", label: "Faster Payments doesn't operate on weekdays", correct: false, explanation: "It runs 24/7." },
      { id: "b", label: "Scheme transaction limits — high-value payments go via CHAPS", correct: true, explanation: "Each rail has a value ceiling; above it, the RTGS (CHAPS) is the standard route for same-day finality." },
      { id: "c", label: "Faster Payments can't carry references", correct: false, explanation: "It carries remittance data fine." },
      { id: "d", label: "CHAPS is cheaper", correct: false, explanation: "CHAPS costs more — it's used because of the limit and finality, not price." },
    ],
  },

  // ── Lab 8: MT103 → ISO 20022 ──
  {
    id: "l8-retired",
    moduleId: "lab-8",
    question: "What happened to the MT103 for cross-border payments in November 2025?",
    options: [
      { id: "a", label: "SWIFT retired it — pacs.008 became the standard", correct: true, explanation: "The MT-to-ISO 20022 coexistence period ended on 22 Nov 2025; correspondent banking now speaks pacs.008." },
      { id: "b", label: "It was upgraded to MT103+", correct: false, explanation: "No such upgrade — the replacement is the ISO 20022 pacs.008." },
      { id: "c", label: "Nothing — it's still the standard", correct: false, explanation: "The retirement deadline has passed." },
      { id: "d", label: "It became optional for domestic payments only", correct: false, explanation: "MT103 was the cross-border format; domestic rails have their own standards." },
    ],
  },
  {
    id: "l8-structured-addr",
    moduleId: "lab-8",
    question: "Why do pacs.008 messages want structured addresses (separate street/town/country fields)?",
    options: [
      { id: "a", label: "Machines can screen and process them reliably — free-text addresses cause holds", correct: true, explanation: "Sanctions screening and STP both need unambiguous fields; a country-only or free-text address is a classic repair trigger." },
      { id: "b", label: "To save message space", correct: false, explanation: "Structured XML is actually longer than free text." },
      { id: "c", label: "For postal delivery of confirmations", correct: false, explanation: "Nothing is mailed — the structure serves automated processing." },
      { id: "d", label: "It's optional styling with no processing impact", correct: false, explanation: "Unstructured addresses increasingly cause holds, and a hard deadline (Nov 2026) makes structure mandatory." },
    ],
  },
  {
    id: "l8-field-map",
    moduleId: "lab-8",
    question: "MT103 field 59 (beneficiary customer) maps to which pacs.008 element?",
    options: [
      { id: "a", label: "Debtor", correct: false, explanation: "The debtor is the payer — MT103 field 50." },
      { id: "b", label: "Creditor", correct: true, explanation: "Field 59's beneficiary becomes the Creditor (Cdtr) block in pacs.008." },
      { id: "c", label: "InstructingAgent", correct: false, explanation: "Agents are banks, not customers." },
      { id: "d", label: "RemittanceInformation", correct: false, explanation: "Remittance info is field 70's payment reference details." },
    ],
  },

  // ── Lab 9: Canada & UK rails ──
  {
    id: "l9-autodeposit",
    moduleId: "lab-9",
    question: "How does Interac e-Transfer Autodeposit change the classic 'security question' flow?",
    options: [
      { id: "a", label: "Funds deposit directly to the registered account — no question, and the sender sees the registered name to confirm", correct: true, explanation: "Autodeposit removes the interceptable Q&A and adds a name-reveal step that works like VoP." },
      { id: "b", label: "It adds a second security question", correct: false, explanation: "It removes the question entirely." },
      { id: "c", label: "It routes through SWIFT instead", correct: false, explanation: "Interac is a domestic Canadian rail." },
      { id: "d", label: "It only works for business accounts", correct: false, explanation: "Autodeposit is open to consumers too." },
    ],
  },
  {
    id: "l9-eft-window",
    moduleId: "lab-9",
    question: "A Canadian EFT batch submitted late Friday evening typically settles when?",
    options: [
      { id: "a", label: "Within seconds", correct: false, explanation: "EFT is a batch rail, not real-time — that's the RTR's future promise." },
      { id: "b", label: "On the next business day's processing window (Monday+)", correct: true, explanation: "EFT files process in windows on business days; late-Friday submissions wait out the weekend." },
      { id: "c", label: "Saturday morning", correct: false, explanation: "Weekends aren't EFT processing days." },
      { id: "d", label: "It's rejected after hours", correct: false, explanation: "Files queue for the next window rather than being rejected." },
    ],
  },
  {
    id: "l9-app-reimb",
    moduleId: "lab-9",
    question: "Under the UK's APP-scam reimbursement rules, who compensates a tricked consumer in most cases?",
    options: [
      { id: "a", label: "Nobody — authorized payments are final", correct: false, explanation: "That was the pre-2024 reality; mandatory reimbursement changed it." },
      { id: "b", label: "The sending and receiving banks, splitting the reimbursement", correct: true, explanation: "The 50/50 split gives receiving banks a real incentive to keep mule accounts out." },
      { id: "c", label: "The government fraud fund", correct: false, explanation: "No taxpayer fund — the banks bear it." },
      { id: "d", label: "The consumer's insurer", correct: false, explanation: "No insurance required — reimbursement is a scheme obligation." },
    ],
  },

  // ── Fees & FX ──
  {
    id: "ffx-sha-math",
    moduleId: "fees-fx",
    question: "$2,000 sent SHA through intermediaries lifting $12.50 and $20.00. The beneficiary receives:",
    options: [
      { id: "a", label: "$2,000.00", correct: false, explanation: "Under SHA the fees come out of the amount in flight." },
      { id: "b", label: "$1,967.50", correct: true, explanation: "$2,000 − $12.50 − $20.00 = $1,967.50." },
      { id: "c", label: "$1,980.00", correct: false, explanation: "That subtracts only one fee — every intermediary in the chain lifts its own." },
      { id: "d", label: "$1,947.50", correct: false, explanation: "That would include a sender-bank fee too, which SHA bills separately to the sender." },
    ],
  },
  {
    id: "ffx-our-cost",
    moduleId: "fees-fx",
    question: "Under OUR, where do the intermediary fees go?",
    options: [
      { id: "a", label: "They're waived", correct: false, explanation: "The work still gets paid for — just not out of the principal." },
      { id: "b", label: "Billed back to the sender on top of the sent amount", correct: true, explanation: "The beneficiary receives the full amount; the sender's bank collects the chain's fees from the sender afterward." },
      { id: "c", label: "Deducted from the beneficiary's other accounts", correct: false, explanation: "Intermediaries have no access to beneficiary accounts." },
      { id: "d", label: "Paid by SWIFT", correct: false, explanation: "SWIFT carries messages; it never pays bank fees." },
    ],
  },
  {
    id: "ffx-margin",
    moduleId: "fees-fx",
    question: "Mid-market GBP/USD is 1.2500; your provider offers 1.2250 with 'zero fees'. On £20,000, the hidden cost is:",
    options: [
      { id: "a", label: "$0 — zero fees means zero cost", correct: false, explanation: "The margin hides in the rate: you receive $24,500 instead of $25,000." },
      { id: "b", label: "$500", correct: true, explanation: "(1.2500 − 1.2250) × 20,000 = $500. 'Zero fees' providers earn from exactly this spread." },
      { id: "c", label: "$250", correct: false, explanation: "The spread is 0.025 per pound across 20,000 pounds — double that." },
      { id: "d", label: "$25", correct: false, explanation: "Off by a factor of twenty — compute spread × amount." },
    ],
  },

  // ── Rails Deep-Dive: UK & Eurozone ──
  {
    id: "gber-bacs-cycle",
    moduleId: "gbp-eur-rails",
    question: "A Bacs Direct Credit file is submitted Thursday at 09:00. When do employees see the money?",
    options: [
      { id: "a", label: "Thursday afternoon", correct: false, explanation: "Bacs is not an instant rail — Day 1 is only file input." },
      { id: "b", label: "Friday morning", correct: false, explanation: "Friday is Day 2 — processing at the banks, no money movement yet." },
      { id: "c", label: "Monday morning", correct: true, explanation: "Day 3 of the cycle falls on Monday: Thursday input, Friday processing, weekend skipped, Monday settlement." },
      { id: "d", label: "Wednesday next week", correct: false, explanation: "That would be a five-business-day cycle; Bacs runs on three." },
    ],
  },
  {
    id: "gber-chaps-finality",
    moduleId: "gbp-eur-rails",
    question: "A CHAPS payment went to the wrong beneficiary. What can the sending bank do?",
    options: [
      { id: "a", label: "Recall it within 24 hours", correct: false, explanation: "There is no CHAPS recall — RTGS settlement is final the moment it happens." },
      { id: "b", label: "Ask the receiving bank to return the funds", correct: true, explanation: "Settlement is final and irrevocable; recovery depends entirely on the beneficiary bank (and beneficiary) cooperating." },
      { id: "c", label: "Reverse it via the Bank of England", correct: false, explanation: "The Bank of England operates the rail; it does not unwind settled payments." },
      { id: "d", label: "Net it off against the next payment", correct: false, explanation: "CHAPS settles gross, payment by payment — there is no netting to offset against." },
    ],
  },
  {
    id: "gber-fps-cap",
    moduleId: "gbp-eur-rails",
    question: "Why can't a £2.4M payment travel on Faster Payments?",
    options: [
      { id: "a", label: "The scheme cap is £1,000,000", correct: true, explanation: "FPS carries payments up to £1M (and most banks cap far lower) — above that you're on CHAPS." },
      { id: "b", label: "FPS only works for consumers", correct: false, explanation: "Businesses use FPS heavily; the constraint is the amount cap, not the customer type." },
      { id: "c", label: "Payments above £1M need government approval", correct: false, explanation: "No approval regime exists — it's a scheme limit, not a legal one." },
      { id: "d", label: "It can, but only on weekdays", correct: false, explanation: "FPS runs 24/7; the cap is about value, not timing." },
    ],
  },
  {
    id: "gber-ipr",
    moduleId: "gbp-eur-rails",
    question: "What did the EU Instant Payments Regulation require of eurozone banks?",
    options: [
      { id: "a", label: "Receive instant payments by Jan 2025 and send by Oct 2025, at no premium over standard SCT", correct: true, explanation: "The IPR made SCT Inst universal: mandatory reach, price parity, and a Verification of Payee check on every transfer." },
      { id: "b", label: "Abolish the standard SEPA Credit Transfer", correct: false, explanation: "SCT remains — the regulation adds instant reach beside it, not instead of it." },
      { id: "c", label: "Cap all transfers at €100,000", correct: false, explanation: "The opposite: the historical €100,000 scheme cap on SCT Inst was lifted; banks set their own limits." },
      { id: "d", label: "Route all euro payments through TARGET2", correct: false, explanation: "TARGET2 stays the wholesale RTGS; retail instant payments clear via TIPS and RT1." },
    ],
  },
  {
    id: "gber-tips",
    moduleId: "gbp-eur-rails",
    question: "Where does a SEPA Instant payment actually settle?",
    options: [
      { id: "a", label: "TIPS (central-bank money) or RT1 (EBA Clearing)", correct: true, explanation: "SCT Inst is the scheme; TIPS and RT1 are the clearing/settlement infrastructures beneath it." },
      { id: "b", label: "Directly between the two banks' apps", correct: false, explanation: "Screens talk to schemes; settlement still happens in shared infrastructure." },
      { id: "c", label: "In the nightly STEP2 batch", correct: false, explanation: "STEP2-T carries the standard SCT batches — instant payments never wait for a batch." },
      { id: "d", label: "On the SWIFT network", correct: false, explanation: "SWIFT carries messages between banks; it is not a settlement system." },
    ],
  },

  // ── Rails Deep-Dive: Canada ──
  {
    id: "cad-lynx-role",
    moduleId: "cad-rails",
    question: "What distinguishes Lynx from EFT in Canada's payment stack?",
    options: [
      { id: "a", label: "Lynx settles each payment in real time and finally; EFT nets batches through ACSS over business days", correct: true, explanation: "Lynx is the RTGS for value and finality; EFT is the batch rail for scheduled volume at cents per payment." },
      { id: "b", label: "Lynx is for consumers, EFT for corporates", correct: false, explanation: "It's the reverse of a customer split — Lynx carries wholesale/high-value flows regardless of who initiates." },
      { id: "c", label: "They're the same system under two names", correct: false, explanation: "Different operators' systems entirely: Lynx (Bank of Canada RTGS) vs ACSS batch clearing." },
      { id: "d", label: "EFT is faster but more expensive", correct: false, explanation: "EFT is slower AND cheaper — that trade-off is exactly why both rails exist." },
    ],
  },
  {
    id: "cad-rtr-change",
    moduleId: "cad-rails",
    question: "What does the Real-Time Rail add that Interac e-Transfer lacks today?",
    options: [
      { id: "a", label: "Real-time clearing and settlement on ISO 20022", correct: true, explanation: "Today the notification is instant but settlement rides existing rails; the RTR makes the money movement itself real-time, with rich data." },
      { id: "b", label: "Email-based addressing", correct: false, explanation: "Alias addressing already exists — that's Interac's signature feature." },
      { id: "c", label: "Unlimited transfer amounts", correct: false, explanation: "Limits are risk controls set by banks and Interac; the RTR doesn't abolish them." },
      { id: "d", label: "Weekend availability", correct: false, explanation: "e-Transfer already runs 24/7 — the gap is settlement speed, not uptime." },
    ],
  },
  {
    id: "cad-eft-weekend",
    moduleId: "cad-rails",
    question: "An EFT file misses Friday's last ACSS window (19:00 ET). When does it begin processing?",
    options: [
      { id: "a", label: "Saturday morning", correct: false, explanation: "ACSS processes on business days only — the weekend doesn't exist for EFT." },
      { id: "b", label: "Monday", correct: true, explanation: "The file waits for the next business day's first window — the same weekend trap as Bacs in the UK." },
      { id: "c", label: "Instantly — windows only affect large files", correct: false, explanation: "Windows gate every EFT file regardless of size." },
      { id: "d", label: "Sunday at midnight", correct: false, explanation: "No ACSS exchange happens on weekends at all." },
    ],
  },
  // ── Sanctions screening ──
  {
    id: "sx-bands",
    moduleId: "sanctions",
    question: "A payment party scores 0.93 against a watchlist entry. What happens?",
    options: [
      { id: "a", label: "Held 24 hours for review", correct: false, explanation: "The hold band sits below this — 0.75 to 0.90. This score clears the harder bar." },
      { id: "b", label: "Automatic rejection — it's a hard hit", correct: true, explanation: "At and above 0.90 the engine rejects outright; a score this close to a listed name never proceeds on its own." },
      { id: "c", label: "Cleared — only exact 1.00 matches count", correct: false, explanation: "Requiring exact spelling would make evasion trivial. Fuzzy scoring exists precisely to catch variants." },
      { id: "d", label: "The name is auto-corrected to the listed spelling", correct: false, explanation: "Screening never rewrites party data — it only decides pass, hold, or reject." },
    ],
  },
  {
    id: "sx-every-hop",
    moduleId: "sanctions",
    question: "Your payment cleared your own bank's sanctions filter. Can it still be blocked for sanctions?",
    options: [
      { id: "a", label: "No — screening happens once, at origination", correct: false, explanation: "Every bank carries its own sanctions liability, so every bank runs its own filter." },
      { id: "b", label: "Yes — every bank in the chain re-screens, with its own thresholds", correct: true, explanation: "Each hop screens independently and tunes its own engine; clearing one filter says nothing about the next." },
      { id: "c", label: "Only if it crosses a border", correct: false, explanation: "Re-screening happens at every institution regardless of geography." },
      { id: "d", label: "Only for amounts over $10,000", correct: false, explanation: "Sanctions screening has no de-minimis amount — a $5 payment to a listed party is still prohibited." },
    ],
  },
  {
    id: "sx-vop-vs-screening",
    moduleId: "sanctions",
    question: "VoP and sanctions screening use the same fuzzy name-matching engine. What's the key difference in what a mid-band score (say 0.80) means?",
    options: [
      { id: "a", label: "VoP: confirm and proceed if satisfied; screening: the payment stops until compliance clears it", correct: true, explanation: "Same arithmetic, opposite posture. A close VoP match is a nudge to double-check; a close screening match takes the decision out of the sender's hands." },
      { id: "b", label: "Screening scores are computed on the account number instead", correct: false, explanation: "Both compare names — screening just compares against a watchlist instead of the account holder." },
      { id: "c", label: "There is no difference", correct: false, explanation: "The consequence differs completely: advisory for VoP, mandatory hold for screening." },
      { id: "d", label: "VoP blocks; screening only warns", correct: false, explanation: "It's the reverse — screening is the one with legal force." },
    ],
  },
  {
    id: "sx-false-positive",
    moduleId: "sanctions",
    question: "What do real screening engines add beyond the name to cut false positives?",
    options: [
      { id: "a", label: "Secondary identifiers: date of birth, address, nationality, document numbers", correct: true, explanation: "Context separates the listed person from the thousands who share the name — the core fix for over-flagging." },
      { id: "b", label: "Stricter spelling requirements", correct: false, explanation: "Stricter spelling would create false NEGATIVES — missing listed parties who transliterate their names differently." },
      { id: "c", label: "A whitelist of common names that skip screening", correct: false, explanation: "Exempting common names would be an open evasion channel." },
      { id: "d", label: "Machine learning that removes the human review step", correct: false, explanation: "Models help rank hits, but possible matches still land with human analysts." },
    ],
  },

  // ── Exceptions & returns ──
  {
    id: "ex-reject-vs-return",
    moduleId: "exceptions-returns",
    question: "What separates a reject from a return?",
    options: [
      { id: "a", label: "A reject happens before settlement; a return sends already-settled money back", correct: true, explanation: "That timing difference drives everything: rejects are cheap (nothing to recover), returns involve real money moving again — minus possible fees." },
      { id: "b", label: "Rejects are for fraud, returns for errors", correct: false, explanation: "Either can involve fraud or error — the distinction is whether settlement happened." },
      { id: "c", label: "They're two names for the same event", correct: false, explanation: "They ride different messages (pacs.002 vs pacs.004) at different stages." },
      { id: "d", label: "Returns only exist on domestic rails", correct: false, explanation: "Cross-border returns are routine — that's exactly what pacs.004 carries." },
    ],
  },
  {
    id: "ex-camt056",
    moduleId: "exceptions-returns",
    question: "What does a camt.056 message do?",
    options: [
      { id: "a", label: "Reverses a settled payment", correct: false, explanation: "Settlement is final — no message unwinds it." },
      { id: "b", label: "Requests cancellation/return of a payment — the receiving side can refuse", correct: true, explanation: "The recall is a request; the answer comes back as a camt.029, and returning settled funds usually needs the account holder's consent." },
      { id: "c", label: "Confirms a payment was credited", correct: false, explanation: "Credit confirmation is a different message family entirely." },
      { id: "d", label: "Reports a sanctions hit", correct: false, explanation: "Screening outcomes travel through status and case messages, not camt.056." },
    ],
  },
  {
    id: "ex-ac04",
    moduleId: "exceptions-returns",
    question: "A pacs.004 arrives with reason code AC04. What happened?",
    options: [
      { id: "a", label: "The beneficiary account is closed", correct: true, explanation: "AC04 = account closed. The funds couldn't be credited and came back." },
      { id: "b", label: "The account number was wrong", correct: false, explanation: "A wrong account number carries its own code — AC01." },
      { id: "c", label: "The payment was a duplicate", correct: false, explanation: "Duplicates return under AM05." },
      { id: "d", label: "The receiving bank suspects fraud", correct: false, explanation: "Fraud-related returns use FRAD." },
    ],
  },
  {
    id: "ex-speed",
    moduleId: "exceptions-returns",
    question: "Why does speed matter so much when recalling a misdirected payment?",
    options: [
      { id: "a", label: "The recall only works while the funds are still in the receiving account", correct: true, explanation: "Once the account holder withdraws or forwards the money, a consented return becomes impossible and recovery turns legal — slow and uncertain." },
      { id: "b", label: "camt.056 messages expire after one hour", correct: false, explanation: "The message doesn't expire — the money's availability does." },
      { id: "c", label: "Banks charge more for recalls after 24 hours", correct: false, explanation: "Fees vary, but cost isn't the reason to hurry — recoverability is." },
      { id: "d", label: "It doesn't — settled payments are equally recoverable at any time", correct: false, explanation: "Every hour increases the chance the funds have moved beyond easy reach." },
    ],
  },

  // ── Ops desk: STP repair & Nostro recon ──
  {
    id: "ops-stp-meaning",
    moduleId: "ops-repair",
    question: "A payment 'fails STP'. What does that actually mean?",
    options: [
      { id: "a", label: "The payment is cancelled and the sender must start over", correct: false, explanation: "Failing STP doesn't kill a payment — it takes it off the automated path." },
      { id: "b", label: "It drops out of straight-through processing into a manual repair queue", correct: true, explanation: "STP failure means a human must fix something before the payment continues — slower and more expensive, but recoverable." },
      { id: "c", label: "It settled without fees being taken", correct: false, explanation: "STP is about automated message processing, not fee treatment." },
      { id: "d", label: "The SWIFT network rejected the connection", correct: false, explanation: "Network delivery and message validity are separate layers — STP failures are content problems." },
    ],
  },
  {
    id: "ops-repair-target",
    moduleId: "ops-repair",
    question: "An STP check flags field 59 (beneficiary) as incomplete. The best repair-desk move is:",
    options: [
      { id: "a", label: "Complete the named field from reliable data and resubmit", correct: true, explanation: "Repairs are surgical: fix exactly what the finding names, using standing instructions or an RFI, and re-run the check." },
      { id: "b", label: "Return the payment to the sender immediately", correct: false, explanation: "Returning a repairable payment wastes days — repair exists to avoid exactly that." },
      { id: "c", label: "Remove the failing field so validation passes", correct: false, explanation: "Deleting required data makes the failure worse, never better." },
      { id: "d", label: "Change the charge code and hope", correct: false, explanation: "Repairs unrelated to the finding fix nothing and can introduce new errors." },
    ],
  },
  {
    id: "ops-break-fee",
    moduleId: "ops-repair",
    question: "Nostro recon: the ledger expected a +50,000 credit; the statement shows +49,965 in the same currency. The most likely explanation is:",
    options: [
      { id: "a", label: "Intermediaries lifted fees from the amount in flight (SHA)", correct: true, explanation: "A small same-currency shortfall on an inbound credit is the classic lift-fee signature — confirm against disclosed charges and book to fees." },
      { id: "b", label: "An FX conversion loss", correct: false, explanation: "No conversion happened — both figures are in the same currency." },
      { id: "c", label: "The correspondent misplaced the funds", correct: false, explanation: "Correspondents rarely lose money outright; small deltas almost always trace to fees or charges." },
      { id: "d", label: "Fraud at the sending bank", correct: false, explanation: "Escalate patterns of unexplained differences — a single small delta with a fee-shaped explanation isn't that." },
    ],
  },
  {
    id: "ops-break-discipline",
    moduleId: "ops-repair",
    question: "Why can't a recon analyst just adjust the ledger to match the statement and move on?",
    options: [
      { id: "a", label: "Every break must be explained first — silent adjustments can hide errors or real losses", correct: true, explanation: "Reconciliation is a control, not bookkeeping hygiene. An unexplained adjustment defeats the whole point and is how losses (and fraud) stay hidden." },
      { id: "b", label: "Ledger systems don't allow manual entries", correct: false, explanation: "They do — with authorization. The barrier is discipline, not software." },
      { id: "c", label: "Statements are frequently wrong", correct: false, explanation: "Statements usually reflect what happened; the question is why the ledger expected something different." },
      { id: "d", label: "Adjustments require the correspondent's permission", correct: false, explanation: "Your ledger is your own — the constraint is your bank's control framework." },
    ],
  },
];

/** All questions belonging to a set of completed modules. */
export function questionsForModules(moduleIds: readonly string[]): PracticeQuestion[] {
  const set = new Set(moduleIds);
  return QUESTION_BANK.filter((q) => set.has(q.moduleId));
}

export function getQuestionById(id: string): PracticeQuestion | undefined {
  return QUESTION_BANK.find((q) => q.id === id);
}
