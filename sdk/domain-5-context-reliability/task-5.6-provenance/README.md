# Task 5.6: Preserve Information Provenance Through Synthesis

## Exam Relevance
Tested in Scenario 3 (Research Coordinator). Assessed skill: S3.

## The Problem: Source Attribution Is Lost During Summarization

When multiple subagents contribute findings to a research report, the synthesis
step is where provenance gets lost. A subagent might report:

```
"AI art tools market grew 47% year-over-year in 2024"
Source: Research Institute report, p.12, published 2025-02-15
```

But after synthesis, the report might say:
```
"The AI art tools market experienced significant growth in 2024."
```

The specific number (47%), the source (Research Institute), the page (12),
and the date (2025-02-15) are all gone. The reader cannot verify the claim,
assess its credibility, or identify potential conflicts with other sources.

## Core Concepts

### 1. Structured Claim-Source Mappings

Every factual claim in the synthesized report must be linked to its source:

```json
{
  "claim": "AI art tools market grew 47% year-over-year in 2024",
  "source": {
    "name": "Research Institute",
    "title": "State of AI in Creative Industries 2025",
    "url": "https://example.com/docs/doc-001",
    "page": 12,
    "publishedDate": "2025-02-15",
    "methodology": "Market analysis of 50 major AI art platforms"
  },
  "confidence": "high",
  "evidenceType": "quantitative"
}
```

This mapping must survive through the synthesis step. The synthesis subagent
receives these mappings and is required to preserve them in its output.

### 2. Handling Conflicting Statistics

When two credible sources report different numbers for the same metric,
the synthesis must present BOTH values with attribution:

```
"AI art tools market growth in 2024:
 - 47% growth (Research Institute, analysis of 50 platforms, Feb 2025)
 - 52% growth (Economic Research Group, analysis of 75 platforms, Jan 2025)

Note: The difference may reflect different platform samples (50 vs. 75)
and different measurement periods."
```

**Anti-pattern: Arbitrary resolution**
```
"AI art tools market grew approximately 50% in 2024."
```
This averages the two values, losing both sources and creating a fabricated
number that neither source actually reported.

### 3. Temporal Context (Publication Dates)

Statistics from different dates should not be compared without noting the
temporal context:

```
"Solar cell efficiency:
 - 33.7% achieved in lab tests (Energy Journal, Jan 2025)
 - 29.1% industry average (Solar Industry Report, June 2024)

Note: The 2024 figure predates the 2025 breakthrough. These are not
competing claims but a temporal progression."
```

Without dates, a reader might think these are contradictory claims about
the same measurement.

### 4. Content Type Rendering

Different types of information should be rendered in the format that best
preserves their meaning:

| Content Type | Best Format | Why |
|-------------|-------------|-----|
| Financial data | Tables | Alignment makes comparison possible |
| Time series | Tables or charts | Temporal ordering matters |
| Qualitative findings | Prose | Nuance requires narrative |
| Methodology notes | Parentheticals or footnotes | Context without disrupting flow |
| Conflicting claims | Side-by-side with attribution | Shows both without resolving |

### 5. Coverage Annotations

The final report should explicitly note what is well-supported and what
has gaps:

**Well-supported**: Multiple independent sources corroborate the claim
**Single-source**: Only one source makes this claim (note: unverified)
**Conflicting**: Sources disagree (present both)
**Gap**: Insufficient data on this subtopic

## Implementation Strategy

### Subagent Output Format

Each subagent returns findings as structured claim-source mappings:

```json
{
  "topic": "AI in visual arts",
  "findings": [
    {
      "claim": "specific statistic or finding",
      "evidence": "supporting detail or methodology",
      "source_url": "https://...",
      "source_name": "Publication Name",
      "publication_date": "YYYY-MM-DD",
      "confidence": "high|medium|low",
      "page": 12
    }
  ]
}
```

### Synthesis Agent Instructions

The synthesis agent must:
1. Preserve claim-source mappings (never drop attribution)
2. Detect conflicting claims on the same metric
3. Present conflicts with both values and sources (never average or pick one)
4. Note temporal differences when comparing statistics from different dates
5. Annotate coverage levels for each section

### Conflict Detection

To detect conflicting claims, the synthesis agent compares:
- Claims about the same metric (e.g., "market growth rate")
- From different sources
- With different values

When detected, the conflict is flagged and both values are preserved with
attribution, along with possible explanations (methodology difference,
temporal difference, sample difference).

## Files in This Directory

| File | Description |
|------|-------------|
| `example.js` | Synthesis with claim-source mappings and conflict handling |
| `exercise.md` | Build synthesis preserving provenance with conflicting statistics |
| `scenario-3-research/claim-source-mapping.js` | Full provenance implementation |
