# Architecture Documentation Index

This directory contains the documentation for the refactor of the `email-deepest-forward` library to a plugin-based architecture with pure recursion.

## Refactor Phases

1.  **[Phase 1: Cc: Header Fix](phase1_cc_fix.md)**
    *   Fixes the recursion bug where `Cc:` headers would break forward detection.
    *   Achieved 100% detection for nested forwards in Gmail format.

2.  **[Phase 2: Plugin Foundation](phase2_plugin_foundation.md)**
    *   Introduction of the `ForwardDetector` interface and `DetectorRegistry`.
    *   Decoupling the detection logic from the main processing loop.

3.  **[Phase 3: Fallback Detectors & Replies](phase3_fallbacks.md)**
    *   Implementation of `OutlookFRDetector`, `NewOutlookDetector`, and `ReplyDetector`.
    *   Achieved **100% compatibility** with 239/239 body fixtures.

4.  **[Confidence Scoring System](../confidence_scoring.md)**
    *   Implementation of the signal-based reliability evaluation.
    *   Handles email density, sender count mismatches, and quote level analysis.

## Planning & Reports

*   **[Overall Plugin Plan](plugin_plan.md)**: The technical blueprint for the refactor.
*   **[Refactor Report](refactor_report.md)**: A summary of the challenges and final results of the modernization.

## Key Stats
*   **Fixture Pass Rate:** 100% on message bodies (239/239)
*   **Recursion Depth:** Successfully tested up to 5 levels.
*   **Languages:** Support for 29+ languages and international reply formats.
