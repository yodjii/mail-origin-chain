import { ForwardDetector, DetectionResult } from './types';
import { Cleaner } from '../utils/cleaner';

/**
 * Detector for Outlook forwards (French) where "Envoyé:" comes BEFORE "De:".
 */
export class OutlookReverseFrDetector implements ForwardDetector {
    readonly name = 'outlook_reverse_fr';
    readonly priority = -45; // Specific detector - High Priority

    // Regex patterns for field detection
    private readonly ENVOYE_PATTERN = /^[ \t]*Envoy(?:é|=E9|e)?\s*:\s*(.*?)\s*$/m;
    private readonly DE_PATTERN = /^[ \t]*De\s*:/i;
    private readonly A_PATTERN = /^[ \t]*(?:À|A|=C0)\s*:/i;
    private readonly OBJET_PATTERN = /^[ \t]*Objet\s*:/i;

    detect(text: string): DetectionResult {
        // 1. Expert Normalization
        const normalized = Cleaner.normalize(text);
        const lines = normalized.split('\n');

        // Find "Envoyé:" as an anchor
        const envoyeMatch = this.ENVOYE_PATTERN.exec(normalized);
        if (!envoyeMatch) return { found: false, confidence: 'low' };

        const envoyeIdx = envoyeMatch.index;

        // Search in a window after "Envoyé:" for "De:"
        // Combined with a window-stop at empty line
        const windowLimit = 15;
        const textUntilEnvoye = normalized.substring(0, envoyeIdx);
        const envoyeLineIndex = textUntilEnvoye.split('\n').length - 1;

        let searchWindow: string[] = [];
        for (let i = envoyeLineIndex; i < Math.min(lines.length, envoyeLineIndex + windowLimit); i++) {
            if (i > envoyeLineIndex && lines[i].trim() === '') break;
            searchWindow.push(lines[i]);
        }

        const findInWindow = (pattern: RegExp) => {
            for (let i = 0; i < searchWindow.length; i++) {
                if (pattern.test(searchWindow[i])) {
                    return { index: envoyeLineIndex + i, line: searchWindow[i] };
                }
            }
            return null;
        };

        const de = findInWindow(this.DE_PATTERN);
        if (!de) return { found: false, confidence: 'low' };

        const a = findInWindow(this.A_PATTERN);
        const objet = findInWindow(this.OBJET_PATTERN);

        const foundHeaders = [{ index: envoyeLineIndex, line: envoyeMatch[0] }, de];
        if (a) foundHeaders.push(a);
        if (objet) foundHeaders.push(objet);

        const firstHeaderIndex = Math.min(...foundHeaders.map(h => h.index));
        const lastHeaderIndex = Math.max(...foundHeaders.map(h => h.index));

        // 2. Expert Body Extraction
        const bodyContent = Cleaner.extractBody(lines, lastHeaderIndex);
        const finalBody = lines[firstHeaderIndex].startsWith('>') ? Cleaner.stripQuotes(bodyContent) : bodyContent;

        // 3. Metadata
        const extractValue = (line: string) => {
            const colonIdx = line.indexOf(':');
            return colonIdx !== -1 ? line.substring(colonIdx + 1).trim() : '';
        };

        const deValue = extractValue(de.line);
        const deMatch = deValue.match(/(.+?)(?:\s*[<\[](.+?)[>\]])?\s*$/);
        const fromName = deMatch ? deMatch[1].trim().replace(/["']/g, '') : deValue;
        const fromEmail = deMatch && deMatch[2] ? deMatch[2].trim() : (fromName.includes('@') ? fromName : '');

        return {
            found: true,
            detector: this.name,
            confidence: 'high',
            message: firstHeaderIndex > 0 ? lines.slice(0, firstHeaderIndex).join('\n').trim() : undefined,
            email: {
                from: fromEmail.includes('@')
                    ? { name: fromName !== fromEmail ? fromName : '', address: fromEmail }
                    : { name: fromName, address: fromName },
                to: a ? extractValue(a.line) : undefined,
                subject: objet ? extractValue(objet.line) : '',
                date: extractValue(envoyeMatch[0]),
                body: finalBody
            }
        };
    }
}
