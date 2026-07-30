---
name: write-valuable-tests
description: Decide whether a proposed software test has meaningful regression value, then design the smallest stable test that protects real behavior. Use whenever adding, updating, reviewing or requesting tests, test coverage, regression tests, contract tests, unit tests or integration tests as part of a code change.
---

# Write Valuable Tests

Add tests selectively. The goal is regression confidence, not test count,
coverage percentage or proof that an implementation was written.

## Apply the value gate

Before writing a test, answer all of these:

1. Name the observable behavior, public contract, security/data invariant or
   previously reproduced bug being protected.
2. Describe a plausible future code change that could break it.
3. Confirm that an existing test, the type checker, schema validation, linting
   or a database constraint would not already catch that break.
4. Explain how the proposed assertion distinguishes the correct behavior from
   the broken behavior.

If any answer is missing or vague, do not add the test. Still run the relevant
existing checks.

## Recognize high-value tests

Prioritize tests for:

- Reproduced bugs and important edge cases.
- Tenant isolation, authorization, signature verification and secret handling.
- Protocol parsing, external provider mappings and public request/response
  contracts relied on by consumers.
- State transitions, idempotency, retry behavior and failure recovery.
- Non-trivial business rules or algorithms with meaningful branches.
- Database behavior that cannot be guaranteed by static types alone.

A contract-presence test is justified only when the contract is externally
consumed or its absence caused a real regression. Test the consumer-visible
result, not the source declaration.

## Reject low-value tests

Do not add tests that only:

- Assert that a file, export, route, field or schema declaration exists.
- Mirror the implementation line by line or assert incidental mock call order.
- Check TypeScript types, Zod declarations, lint rules or database constraints a
  second time without additional runtime behavior.
- Exercise trivial getters, object construction or framework behavior.
- Duplicate an existing happy path with different unimportant fixture values.
- Snapshot large generated structures without selecting meaningful semantics.
- Chase coverage metrics without identifying a concrete failure mode.

## Design the smallest durable test

- Extend the nearest existing test when that keeps the behavior discoverable.
- Choose the lowest-cost layer that faithfully observes the risk: unit for pure
  logic, integration for component boundaries, and end-to-end only for a
  cross-system behavior that lower layers cannot prove.
- Add one representative happy path and only the boundary/error cases tied to
  distinct risks. Avoid combinatorial cases with identical logic.
- Assert public outputs, persisted state or externally visible effects. Avoid
  private functions and replaceable implementation details.
- Keep fixtures minimal, deterministic and free of unrelated data.
- Make the test fail for the intended bug before relying on it when practical.

## Review existing tests

For each test under review, ask: “What realistic regression does this catch?”
Keep it when the answer is concrete and the assertion targets that regression.
Simplify, merge or remove it when it duplicates stronger coverage or only
constrains a valid refactor.
