import EmailForwardParser from 'email-forward-parser';
import { ForwardDetector, DetectionResult } from './types';

/**
 * Crisp detector - uses the email-forward-parser library
 * This is the primary detector with highest priority
 */
export class CrispDetector implements ForwardDetector {
    readonly name = 'crisp';
    readonly priority = 100; // Fallback - universal library (lower priority than specifics)

    private parser = new EmailForwardParser();

    detect(text: string): DetectionResult {
        const result = this.parser.read(text, undefined);

        if (!result?.forwarded || !result?.email) {
            return {
                found: false,
                confidence: 'low'
            };
        }

        // Convert Crisp result to our DetectionResult format
        const from = result.email.from;
        const fromValue = typeof from === 'string'
            ? from
            : from
                ? { name: from.name || '', address: from.address || '' }
                : '';

        const to = result.email.to;
        const toValue = Array.isArray(to) && to.length > 0
            ? (typeof to[0] === 'string' ? to[0] : { name: (to[0] as any).name || '', address: (to[0] as any).address || '' })
            : (typeof to === 'string' ? to : undefined);

        return {
            found: true,
            email: {
                from: fromValue,
                to: toValue,
                subject: result.email.subject || undefined,
                date: result.email.date || undefined,
                body: result.email.body || undefined
            },
            message: result.message || undefined,
            confidence: 'high' // Crisp is very reliable
        };
    }
}
