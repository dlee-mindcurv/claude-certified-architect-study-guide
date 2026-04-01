# Task 4.1: Define Explicit Review Criteria

## Exam Relevance
Tested in Scenario 5 (CI/CD Code Review Pipeline).

## Why Explicit Criteria Matter

The most common mistake in production review prompts is using vague qualitative
instructions like "be conservative" or "only flag important issues." These
instructions fail because they are not measurable -- Claude has no shared
definition of "conservative" or "important" with your team.

### The Problem with Vague Instructions

Consider this prompt:

```
Review this code and report any issues you find. Be conservative.
```

This fails in three specific ways:

1. **No shared definition.** "Conservative" could mean "only flag critical
   security issues" or "flag everything but mark most as low severity." Without
   a categorical definition, Claude must guess what you mean -- and it will
   guess differently across runs.

2. **No measurable threshold.** You cannot calculate a false positive rate
   against "be conservative" because there is no objective standard to measure
   against. Without measurement, you cannot improve.

3. **No skip criteria.** Without explicit rules about what NOT to flag, Claude
   will flag style preferences, naming conventions, and import ordering --
   issues that waste developer attention and erode trust in the tool.

### The Solution: Categorical Severity Levels

Explicit criteria replace qualitative guidance with categorical rules:

```
### REPORT (must flag these):
**Bugs (severity: high)**
- Null/undefined access without guards
- Off-by-one errors in loops or array access
- Race conditions in async code

**Security (severity: critical)**
- SQL injection (string concatenation in queries)
- XSS vulnerabilities (unescaped user input in HTML)
- Hardcoded secrets or credentials

### SKIP (do NOT flag these):
- Minor style preferences (semicolons, trailing commas)
- Import ordering
- Missing JSDoc on internal functions
```

Each criterion is:
- **Observable** -- you can look at the code and determine if the pattern exists
- **Categorical** -- it falls into a specific severity bucket
- **Testable** -- you can compute false positive rates per category

### Impact on Developer Trust

False positive rates directly determine whether developers trust automated
review. Research on static analysis tool adoption shows:

- Below 20% false positive rate: developers engage with findings
- Above 30% false positive rate: developers start ignoring findings
- Above 50% false positive rate: developers lobby to remove the tool

The `detected_pattern` field in review output enables systematic tracking.
When a specific pattern (e.g., "unused-import") produces more than 30% false
positives, you can temporarily disable that category while improving the prompt
-- rather than discarding the entire system.

### Temporarily Disabling High False-Positive Categories

Production review systems should support per-category suppression:

```js
const SKIP_PATTERNS = ['unused-import', 'generic-naming'];

const filtered = findings.filter(
  f => !SKIP_PATTERNS.includes(f.detected_pattern)
);
```

This approach:
- Preserves high-value categories while iterating on problematic ones
- Provides data to improve prompts for disabled categories offline
- Prevents false-positive fatigue from degrading trust in valid findings

## Concrete Code Examples in Criteria

Including concrete code examples for each severity level dramatically improves
consistency. Rather than describing what a "null access without guard" looks like
in prose, show the exact pattern:

```
Example -- flag this:
const firstUser = users.filter(u => u.active)[0].name;
// Bug: users.filter() could return empty array, causing undefined access
```

These examples serve as implicit few-shot demonstrations within the criteria
itself, helping Claude distinguish between patterns that should and should not
be flagged.

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Comparison of vague vs. explicit criteria prompts |
| `exercise.md` | Write review criteria with severity levels |
| `scenario-5-ci/review-criteria.js` | Full CI review criteria implementation |
