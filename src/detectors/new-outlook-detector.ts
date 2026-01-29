import { ForwardDetector, DetectionResult } from './types';
import { Cleaner } from '../utils/cleaner';

/**
 * Detector for "Plain Header" format (common in New Outlook, Outlook 2013, Mobile clients)
 * Pattern: Localized headers like From/De/Von, To/À/An, Date/Sent/Envoyé
 */
export class NewOutlookDetector implements ForwardDetector {
    readonly name = 'new_outlook';
    readonly priority = -40; // Specific detector - High Priority (Override)

    detect(text: string): DetectionResult {
        // 1. Expert Normalization
        const normalized = Cleaner.normalize(text);

        // Define multi-lingual header maps
        const labels = {
            from: ['From', 'De', 'Von', 'Da', 'Od', 'Fra', 'Kimden', 'Van', 'Från', 'De ', 'Lähettäjä', 'Feladó', 'От'],
            date: ['Date', 'Sent', 'Envoyé', 'Gesendet', 'Inviato', 'Enviado', 'Data', 'Sendt', 'Lähetetty', 'Skickat', 'Datum', 'Dátum', 'Päivämäärä', 'Tarih', 'Дата'],
            subject: ['Subject', 'Objet', 'Betreff', 'Oggetto', 'Assunto', 'Asunto', 'Emne', 'Aihe', 'Ämne', 'Předmět', 'Predmet', 'Tárgy', 'Temat', 'Тема', 'Konu', 'Onderwerp'],
            to: ['To', 'À', 'A', 'An', 'Para', 'Til', 'Vastaanottaja', 'Till', 'Pro', 'Za', 'Címzett', 'Do', 'Кому', 'Kime', 'Aan']
        };

        const lines = normalized.split('\n').map(l => l.trimRight());

        // Helper to find a header in a set of lines
        const findHeader = (searchLines: string[], keys: string[]) => {
            for (let i = 0; i < searchLines.length; i++) {
                const line = searchLines[i];
                for (const key of keys) {
                    const regex = new RegExp(`^\\s*[\\*_]*${key}[\\*_]*\\s*:`, 'i');
                    if (line.match(regex)) {
                        const colonIndex = line.indexOf(':');
                        return { index: i, line, key, value: line.substring(colonIndex + 1).trim() };
                    }
                }
            }
            return null;
        };

        // 2. Identification
        const fromMatch = findHeader(lines, labels.from);
        if (!fromMatch) return { found: false, confidence: 'low' };

        const fromIndex = fromMatch.index;

        // CRITICAL: The window must stop if we hit an empty line (end of headers)
        let searchWindow: string[] = [];
        const windowLimit = 15;
        const searchStart = Math.max(0, fromIndex - 2);
        for (let i = searchStart; i < Math.min(lines.length, fromIndex + windowLimit); i++) {
            if (i > fromIndex && lines[i].trim() === '') break;
            searchWindow.push(lines[i]);
        }

        const findHeaderInWindow = (keys: string[]) => {
            for (let j = 0; j < searchWindow.length; j++) {
                const line = searchWindow[j];
                for (const key of keys) {
                    const regex = new RegExp(`^\\s*[\\*_]*${key}[\\*_]*\\s*:`, 'i');
                    if (line.match(regex)) {
                        const colonIndex = line.indexOf(':');
                        return { index: searchStart + j, line, key, value: line.substring(colonIndex + 1).trim() };
                    }
                }
            }
            return null;
        };

        const subject = findHeaderInWindow(labels.subject);
        if (!subject) return { found: false, confidence: 'low' };

        const date = findHeaderInWindow(labels.date);
        const to = findHeaderInWindow(labels.to);

        const fromValue = fromMatch.value;
        const emailMatch = fromValue.match(/[<\[](?:mailto:)?(.*?)[>\]]/i);
        const address = emailMatch ? emailMatch[1].trim() : (fromValue.includes('@') ? fromValue : '');
        const name = fromValue.replace(/[<\[].*?[>\]]/g, '').trim() || address;

        const subjectIndex = subject.index;
        const dateIndex = date ? date.index : -1;
        const toIndex = to ? to.index : -1;

        const lastHeaderIndex = Math.max(fromIndex, subjectIndex, dateIndex, toIndex);

        // 3. Expert Body Extraction
        const bodyContent = Cleaner.extractBody(lines, lastHeaderIndex);
        const finalBody = fromMatch.line.startsWith('>') ? Cleaner.stripQuotes(bodyContent) : bodyContent;

        // 4. Message (preceding text)
        let messageEndIndex = fromIndex;
        if (messageEndIndex > 0) {
            for (let k = 1; k <= 5; k++) {
                if (messageEndIndex - k < 0) break;
                const prevLine = lines[messageEndIndex - k].trim();
                if (prevLine.match(/^-{2,}.*-{2,}$/) || prevLine.match(/^_{3,}$/)) {
                    messageEndIndex = messageEndIndex - k;
                    break;
                }
                if (prevLine === '') continue;
                break;
            }
        }

        const message = messageEndIndex > 0 ? lines.slice(0, messageEndIndex).join('\n').trim() : undefined;

        return {
            found: true,
            email: {
                from: address ? { name: name.replace(/["']/g, ''), address: address } : name,
                to: to ? to.value : undefined,
                subject: subject.value,
                date: date ? date.value : undefined,
                body: finalBody
            },
            message: message,
            confidence: 'medium'
        };
    }
}
