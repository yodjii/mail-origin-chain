import { ForwardDetector, DetectionResult } from './types';
import { CrispDetector } from './crisp-detector';
import { OutlookFRDetector } from './outlook-fr-detector';
import { NewOutlookDetector } from './new-outlook-detector';

import { OutlookEmptyHeaderDetector } from './outlook-empty-header-detector';
import { OutlookReverseFrDetector } from './outlook-reverse-fr-detector';
import { ReplyDetector } from './reply-detector';

/**
 * Registry for managing forward detection plugins
 * Detectors are tried in priority order (lower number = higher priority)
 */
export class DetectorRegistry {
    private detectors: ForwardDetector[] = [];

    constructor(customDetectors: ForwardDetector[] = []) {
        // Register all detectors (priority determines order)
        this.register(new OutlookEmptyHeaderDetector()); // priority: -50 (Very specific)
        this.register(new OutlookReverseFrDetector());   // priority: -45 (Specific)
        this.register(new NewOutlookDetector());         // priority: -40 (Specific)
        this.register(new OutlookFRDetector());          // priority: -30 (Fallback for FR)
        this.register(new ReplyDetector());              // priority: -10 (Replies)
        this.register(new CrispDetector());               // priority: 100 (Universal fallback)

        // Register custom detectors
        customDetectors.forEach(detector => this.register(detector));
    }

    /**
     * Register a new detector
     * @param detector The detector to register
     */
    register(detector: ForwardDetector): void {
        this.detectors.push(detector);
        // Sort by priority (lower number = higher priority)
        this.detectors.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Attempt to detect a forward using all registered detectors
     * Detectors are tried in priority order until one succeeds
     * @param text The text to analyze
     * @returns Detection result from the first successful detector
     */
    detect(text: string): DetectionResult {
        let bestResult: DetectionResult | null = null;
        let bestIndex = Infinity;

        for (const detector of this.detectors) {
            const result = detector.detect(text);
            if (result.found) {
                // Check if the result is actually useful (has an email address)
                const hasValidEmail = result.email && (
                    (typeof result.email.from === 'string' && result.email.from.trim().length > 0) ||
                    (typeof result.email.from === 'object' && (result.email.from.address?.trim() || result.email.from.name?.trim()))
                );

                if (hasValidEmail) {
                    // Calculate the position of the match based on the length of the preceding message
                    // We assume result.message is the text BEFORE the forward.
                    const matchIndex = result.message ? result.message.length : 0;

                    // If this match is earlier in the text, it's a better candidate for the "next" forward
                    // If matches start at the same position, fallback to priority (order in this.detectors)
                    if (matchIndex < bestIndex) {
                        bestIndex = matchIndex;
                        result.detector = detector.name;
                        bestResult = result;
                    }
                }
            }
        }

        if (bestResult) {
            return bestResult;
        }

        // No detector found a forward
        return {
            found: false,
            confidence: 'low'
        };
    }

    /**
     * Get all registered detector names in priority order
     */
    getDetectorNames(): string[] {
        return this.detectors.map(d => d.name);
    }
}
