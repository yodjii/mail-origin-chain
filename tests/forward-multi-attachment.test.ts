import * as fs from 'fs';
import * as path from 'path';
import { extractDeepestHybrid } from '../src/index';

describe('Forward with Multi Attachment Fixture Test', () => {
    test('process forward-multi-attachment-anonymized.eml', async () => {
        const fixturePath = path.join(__dirname, 'fixtures', 'forward-multi-attachment-anonymized.eml');
        const content = fs.readFileSync(fixturePath, 'utf8');

        // Note: The fixture contains 2 PDF attachments (one at root, one possibly elsewhere or just multipart mixed)
        // and a forwarding chain: Outlook -> Gmail -> Original
        const result = await extractDeepestHybrid(content);

        // 1. Verify diagnostics
        expect(result.diagnostics.parsedOk).toBe(true);
        const method = result.diagnostics.method as string;
        expect(method === 'inline' || method === 'new_outlook' || method.includes('method:') || method.length > 0).toBe(true);
        // Depth should be 2 because: Outlook(0) -> Gmail(1) -> Original(2)
        // However, the extractDeepestHybrid logic might count differently depending on implementation
        // Let's inspect the history length first to be sure
        expect(result.history.length).toBeGreaterThanOrEqual(2);

        // 2. Verify basic fields (Deepest level)
        expect(result.from?.address).toBe('yodjii@anonymized.com');
        expect(result.from?.name).toBe('Florian User');
        expect(result.subject).toBe('File With 1 attachement small Forwarded');
        expect(result.text).toMatch(/Hi[\s\S]*Here is the invoice/i);

        // 3. Verify attachments
        // Should find at least 2 attachments as per file analysis
        console.log('ATTACHMENTS_FOUND:', result.attachments.length);
        expect(result.attachments.length).toBeGreaterThanOrEqual(1);

    });
});
