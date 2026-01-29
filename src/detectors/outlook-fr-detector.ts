import { ForwardDetector, DetectionResult } from './types';
import { Cleaner } from '../utils/cleaner';

/**
 * Detector for French Outlook format (and variations)
 * Handles "De: / Envoyé: / À: / Objet:" in any order
 */
export class OutlookFRDetector implements ForwardDetector {
    readonly name = 'outlook_fr';
    readonly priority = -30; // Specific detector - High Priority (Override)

    detect(text: string): DetectionResult {
        // 1. Expert Normalization
        const normalized = Cleaner.normalize(text);
        const lines = normalized.split('\n');

        // Safe patterns: must be start of line
        const dePattern = /^[ \t]*De\s*:/i;
        const objetPattern = /^[ \t]*Objet\s*:/i;
        const envoyePattern = /^[ \t]*Envoy(?:é|=E9|e)?\s*:/i;
        const aPattern = /^[ \t]*(?:À|A|=C0)\s*:/i;
        const datePattern = /^[ \t]*Date\s*:/i;

        // Find the FIRST potential header as an anchor
        let anchorIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (dePattern.test(line) || objetPattern.test(line)) {
                anchorIndex = i;
                break;
            }
        }

        if (anchorIndex === -1) return { found: false, confidence: 'low' };

        // Look in a window around the anchor (usually headers are clustered within 10 lines)
        // CRITICAL: The window must stop if we hit an empty line (end of headers)
        let searchWindow: string[] = [];
        const windowLimit = 15;
        const searchStart = Math.max(0, anchorIndex - 2);
        for (let i = searchStart; i < Math.min(lines.length, anchorIndex + windowLimit); i++) {
            if (i > anchorIndex && lines[i].trim() === '') break;
            searchWindow.push(lines[i]);
        }

        const findInWindow = (pattern: RegExp) => {
            for (let i = 0; i < searchWindow.length; i++) {
                if (pattern.test(searchWindow[i])) {
                    return { index: searchStart + i, line: searchWindow[i] };
                }
            }
            return null;
        };

        const de = findInWindow(dePattern);
        const objet = findInWindow(objetPattern);

        // Required headers for confidence
        if (!de || !objet) {
            // console.log('OutlookFRDetector: Required headers missing in window');
            return { found: false, confidence: 'low' };
        }

        const envoye = findInWindow(envoyePattern);
        const date = findInWindow(datePattern);
        const a = findInWindow(aPattern);

        const foundHeaders = [de, objet];
        if (envoye) foundHeaders.push(envoye);
        if (date) foundHeaders.push(date);
        if (a) foundHeaders.push(a);

        const firstHeaderIndex = Math.min(...foundHeaders.map(h => h.index));
        const lastHeaderIndex = Math.max(...foundHeaders.map(h => h.index));

        // 2. Expert Body Extraction
        const bodyContent = Cleaner.extractBody(lines, lastHeaderIndex);
        const finalBody = lines[firstHeaderIndex].startsWith('>') ? Cleaner.stripQuotes(bodyContent) : bodyContent;

        // 3. Extract metadata
        const extractValue = (line: string) => {
            const colonIdx = line.indexOf(':');
            return colonIdx !== -1 ? line.substring(colonIdx + 1).trim() : '';
        };

        const subject = extractValue(objet.line);
        const dateRaw = envoye ? extractValue(envoye.line) : (date ? extractValue(date.line) : undefined);
        const deValue = extractValue(de.line);

        // Simple name/email split for 'De:'
        const deMatch = deValue.match(/(.+?)(?:\s*[<\[](.+?)[>\]])?\s*$/);
        const fromName = deMatch ? deMatch[1].trim().replace(/["']/g, '') : deValue;
        const fromEmail = deMatch && deMatch[2] ? deMatch[2].trim() : (fromName.includes('@') ? fromName : '');

        // 4. Message (preceding text)
        let messageEnd = firstHeaderIndex;
        if (messageEnd > 0) {
            for (let i = 1; i <= 5; i++) {
                const prevLineIdx = firstHeaderIndex - i;
                if (prevLineIdx < 0) break;
                const prevLine = lines[prevLineIdx].trim();
                if (prevLine.match(/^-{2,}.*-{2,}$/) || prevLine.match(/^_{3,}$/)) {
                    messageEnd = prevLineIdx;
                    break;
                }
                if (prevLine === '') continue;
                break;
            }
        }

        return {
            found: true,
            email: {
                from: fromEmail.includes('@')
                    ? { name: fromName !== fromEmail ? fromName : '', address: fromEmail }
                    : { name: fromName, address: fromName },
                to: a ? extractValue(a.line) : undefined,
                subject,
                date: dateRaw,
                body: finalBody
            },
            message: messageEnd > 0 ? lines.slice(0, messageEnd).join('\n').trim() : undefined,
            confidence: 'high'
        };
    }
}
