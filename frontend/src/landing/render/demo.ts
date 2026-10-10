/**
 * Demonstration values: the fictional payment, its illustrative timestamps,
 * the example IBAN, the sample SSI record and the tool examples. Every value
 * that claims a computed result is asserted against the real Relay code by
 * tests/test_landing_demo_claims.py, which reads the same demo.json.
 */
import demo from "./demo.json";

export type Demo = typeof demo;
export const DEMO: Demo = demo;
