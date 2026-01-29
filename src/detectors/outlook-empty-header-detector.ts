import { ForwardDetector, DetectionResult } from './types';
import { Cleaner } from '../utils/cleaner';

/**
 * Detector for Outlook forwards where the "Envoyé:" (Sent) header is present but empty.
 * Example of failing block:
 * ________________________________
 * De: Florian M.
 * Envoyé:
 * À: Flo M.
 * Objet: RE: ...
 */
export class OutlookEmptyHeaderDetector implements ForwardDetector {
    readonly name = 'outlook_empty_header';
    readonly priority = -50; // Very specific - High Priority

    // Regex to capture the header block:
    // 1. Optional Separator (mostly underscores)
    // 2. De: ... (From)
    // 3. Envoyé: ... (Date) - Allow to be empty
    // 4. À: ... (To)
    // 5. Objet: ... (Subject)
    private readonly HEADER_PATTERN = /^(?:_{30,}[ \t]*)?[\r\n]*De\s*:[ \t]*([^\r\n]+)\r?\nEnvoy(?:[é|e]|=[E|e]9)(?:[ \t]*:[ \t]*|\s*=\s*E9\s*:[ \t]*)(.*)\r?\n(?:[ÀA]|\=[C|c]0)\s*:[ \t]*([^\r\n]+)\r?\nObjet\s*:[ \t]*([^\r\n]+)/im;

    detect(text: string): DetectionResult {
        // 1. Expert Normalization
        const normalized = Cleaner.normalize(text);

        const match = this.HEADER_PATTERN.exec(normalized);

        if (match) {
            const fullMatch = match[0];
            const fromLine = match[1].trim();
            const dateLine = match[2].trim();
            const toLine = match[3].trim();
            const subjectLine = match[4].trim();

            const matchIndex = normalized.indexOf(fullMatch);
            const message = normalized.substring(0, matchIndex).trim();

            // 2. Expert Body Extraction
            const lines = normalized.split('\n');
            // Find line index of the end of the header match
            const textUntilEnd = normalized.substring(0, matchIndex + fullMatch.length);
            const lastHeaderLineIndex = textUntilEnd.split('\n').length - 1;

            const bodyContent = Cleaner.extractBody(lines, lastHeaderLineIndex);
            // If the block started with a quote, we must strip quotes
            const finalBody = fullMatch.trim().startsWith('>') ? Cleaner.stripQuotes(bodyContent) : bodyContent;

            if (fromLine.length > 0) {
                return {
                    found: true,
                    detector: this.name,
                    confidence: 'high',
                    message: message || undefined,
                    email: {
                        from: fromLine,
                        to: toLine,
                        subject: subjectLine,
                        date: dateLine || undefined,
                        body: finalBody
                    }
                };
            }
        }

        return { found: false, confidence: 'low' };
    }
}
