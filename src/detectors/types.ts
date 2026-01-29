/**
 * Result of a forward detection attempt
 */
export interface DetectionResult {
    /** Whether a forward was detected */
    found: boolean;

    /** Extracted email data if found */
    email?: {
        from: string | { name: string; address: string };
        to?: string | { name: string; address: string };
        subject?: string;
        date?: string;
        body?: string;
    };

    /** Exclusive content before the forward separator */
    message?: string;

    /** Identifier of the successful detector */
    detector?: string;

    /** Confidence level of the detection */
    confidence: 'high' | 'medium' | 'low';
}

/**
 * Interface for forward detection plugins
 */
export interface ForwardDetector {
    /** Unique identifier for this detector */
    readonly name: string;

    /** Priority (lower number = higher priority, Crisp = 0) */
    readonly priority: number;

    /**
     * Attempt to detect a forwarded email in the given text
     * @param text The text to analyze
     * @returns Detection result with email data if found
     */
    detect(text: string): DetectionResult;
}
