
import { extractDeepestHybrid } from '../src/index';
import { ForwardDetector, DetectionResult } from '../src/types';

describe('Plugin System', () => {

    // Define a custom detector that looks for a specific pattern
    class CustomMagicDetector implements ForwardDetector {
        name = 'magic-plugin';
        priority = -100; // Very high priority (overrides all built-ins)

        detect(text: string): DetectionResult {
            // Looks for "----*MAGIC-FORWARD-START*----"
            const magicMarker = "----*MAGIC-FORWARD-START*----";
            const idx = text.indexOf(magicMarker);

            if (idx !== -1) {
                const message = text.substring(0, idx).trim();
                const remainder = text.substring(idx + magicMarker.length).trim();

                // Simple parsing of headers from the remainder
                // Format expected:
                // From: ...
                // Date: ...
                // Subject: ...
                // 
                // Body...

                const fromMatch = remainder.match(/^From: (.+)$/m);
                const dateMatch = remainder.match(/^Date: (.+)$/m);
                const subjectMatch = remainder.match(/^Subject: (.+)$/m);

                // Find end of headers (double newline)
                const bodyStartIdx = remainder.indexOf('\n\n');
                const body = bodyStartIdx !== -1 ? remainder.substring(bodyStartIdx).trim() : remainder;

                if (fromMatch) {
                    return {
                        found: true,
                        detector: this.name,
                        confidence: 'high',
                        message: message,
                        email: {
                            from: { name: '', address: fromMatch[1].trim() },
                            subject: subjectMatch ? subjectMatch[1].trim() : undefined,
                            date: dateMatch ? dateMatch[1].trim() : undefined,
                            body: body
                        }
                    };
                }
            }

            return { found: false, confidence: 'low' };
        }
    }

    test('should prioritize custom detector when it matches earlier', async () => {
        const emailContent = `
Hello standard world.

----*MAGIC-FORWARD-START*----
From: wizard@magic.com
Date: 2026-01-28T12:00:00.000Z
Subject: Magic Subject

This is the magic body.

This is NOT a standard forward anymore.
Just plain text.
        `;

        const result = await extractDeepestHybrid(emailContent, {
            skipMimeLayer: true,
            customDetectors: [new CustomMagicDetector()]
        });

        // Diagnostics should show our custom method
        expect(result.diagnostics.method).toBe('magic-plugin');

        // Depth should be 1 (we found one forward)
        expect(result.diagnostics.depth).toBe(1);

        // Extracted data should come from our plugin
        expect(result.from?.address).toBe('wizard@magic.com');
        expect(result.text).toContain('This is the magic body.');
        expect(result.text).toContain('Just plain text.');

        // History should show the chain (Deepest -> Root)
        expect(result.history.length).toBe(2);
        expect(result.history[1].text).toBe('Hello standard world.'); // The part BEFORE the magic marker

        // Check that the history entry flags contain our custom method
        // history[0] is the forwarded message (deepest)
        expect(result.history[0].flags).toContain('method:magic-plugin');
    });

    test('should handle multi-level chain with custom detector at intermediate level (history[1])', async () => {
        const multiLevel = `
Top level root message.

----*MAGIC-FORWARD-START*----
From: wizard@magic.com
Date: 2026-01-28T12:00:00.000Z
Subject: Magic Subject

Intermediate level message found by magic.

________________________________
From: deepest@test.com
Sent: Mon, 26 Jan 2026 15:00:00 +0100
Subject: Deepest

Deepest message body.
        `;

        const result = await extractDeepestHybrid(multiLevel, {
            skipMimeLayer: true,
            customDetectors: [new CustomMagicDetector()]
        });

        // Verify chain length (Root -> Magic -> Standard) = 3
        expect(result.history.length).toBe(3);

        // history[0] = Deepest (Standard)
        expect(result.history[0].from?.address).toBe('deepest@test.com');
        expect(result.history[0].text).toContain('Deepest message body');
        // Standard detector should satisfy parsedOk or have specific method
        expect(result.history[0].flags.some(f => f.startsWith('method:') && !f.includes('magic-plugin'))).toBeTruthy();

        // history[1] = Intermediate (Magic)
        expect(result.history[1].from?.address).toBe('wizard@magic.com');
        expect(result.history[1].text).toContain('Intermediate level message found by magic');
        expect(result.history[1].flags).toContain('method:magic-plugin');
    });

    test('should break ties using priority when two detectors match at the same index', async () => {
        // Detector A: Low Priority (10)
        class DetectorLowPriority implements ForwardDetector {
            name = 'low-prio';
            priority = 10;
            detect(text: string) {
                if (text.startsWith('SAME-MATCH')) {
                    return { found: true, detector: this.name, confidence: 'high' as const, email: { from: 'low@test.com', body: 'body' } };
                }
                return { found: false, confidence: 'low' as const };
            }
        }

        // Detector B: High Priority (-5)
        class DetectorHighPriority implements ForwardDetector {
            name = 'high-prio';
            priority = -5;
            detect(text: string) {
                if (text.startsWith('SAME-MATCH')) {
                    return { found: true, detector: this.name, confidence: 'high' as const, email: { from: 'high@test.com', body: 'body' } };
                }
                return { found: false, confidence: 'low' as const };
            }
        }

        const content = `SAME-MATCH\n\nSome content`;

        const result = await extractDeepestHybrid(content, {
            skipMimeLayer: true,
            customDetectors: [new DetectorLowPriority(), new DetectorHighPriority()]
        });

        // Should choose 'high-prio' because priorities are checked for ties at index 0
        expect(result.diagnostics.method).toBe('high-prio');
        expect(result.from?.address).toBe('high@test.com');
    });

    test('should work without custom detectors (regression check)', async () => {
        const simple = `
Hi there,

________________________________
From: standard@test.com
Subject: Test

Standard Body
        `;

        const result = await extractDeepestHybrid(simple, { skipMimeLayer: true });

        // Should find standard outlook
        expect(result.diagnostics.parsedOk).toBeTruthy();
        expect(result.from?.address).toBe('standard@test.com');
    });
});
