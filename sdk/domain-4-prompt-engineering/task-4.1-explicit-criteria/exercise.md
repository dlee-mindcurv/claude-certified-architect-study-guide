# Exercise: Define Explicit Review Criteria

## Objective

Write a complete set of review criteria with severity levels, concrete code
examples, and skip rules. Then measure the false positive rate against a known
code sample.

## Setup

Use the sample code from `example.js` or bring your own codebase snippet with
known issues (at least 3 real issues and some style-only patterns that should
NOT be flagged).

## Part 1: Write Criteria (30 minutes)

Create a review criteria prompt that includes:

1. **Three severity levels** with clear definitions:
   - What type of issue belongs at each level?
   - What is the merge-blocking threshold? (e.g., critical blocks, high recommends)

2. **Concrete code examples** for each severity:
   - For each category (bugs, security, logic), provide at least one "flag this"
     code snippet showing the exact pattern.
   - Make examples language-specific (JavaScript/TypeScript for this exercise).

3. **Explicit skip rules** listing at least 5 categories to NOT flag:
   - Style preferences
   - Naming conventions
   - Import ordering
   - Missing documentation on internal functions
   - Add at least one more specific to your team/project

4. **A detected_pattern field** in the output format:
   - Each finding must include a machine-readable pattern identifier
   - Examples: "sql-injection", "null-access-without-guard", "missing-await"

## Part 2: Measure False Positives (20 minutes)

1. Prepare a code sample with exactly N known real issues and M known
   non-issues (style preferences, naming, etc.).

2. Run your criteria prompt against the sample 5 times.

3. For each run, classify every finding as:
   - **True positive:** correctly identifies a real issue
   - **False positive:** flags something that should have been skipped
   - **False negative:** misses a real issue

4. Calculate:
   ```
   False positive rate = false_positives / (true_positives + false_positives)
   False negative rate = false_negatives / total_known_issues
   ```

5. If any `detected_pattern` exceeds 30% false positive rate across runs,
   add it to your skip rules and re-run.

## Part 3: Iterate (15 minutes)

1. Review the false positive patterns. For each:
   - Can you make the criterion more specific? (e.g., "unused import" is too
     broad -- "unused import of side-effect-free module" is more precise)
   - Should you add a concrete "do NOT flag this" example?

2. Re-run the improved prompt and compare false positive rates.

## Success Criteria

- [ ] Criteria include at least 3 severity levels with definitions
- [ ] Each severity level has at least one concrete code example
- [ ] Skip rules list at least 5 categories with rationale
- [ ] Output format includes detected_pattern for every finding
- [ ] False positive rate is below 20% after iteration
- [ ] At least one pattern was refined based on measurement data

## Exam Tip

The exam tests whether you understand WHY explicit criteria outperform vague
instructions. The key insight: "be conservative" is not measurable. Severity
levels with concrete examples and skip rules create a specification that can
be tested, iterated, and improved systematically. The detected_pattern field
is what makes this iteration possible -- without it, you cannot identify which
specific criteria are producing false positives.
