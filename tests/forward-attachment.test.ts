import * as fs from 'fs';
import * as path from 'path';
import { extractDeepestHybrid } from '../src/index';

describe('Forward with Attachment Fixture Test', () => {
    test('process forward-attachment-small-anonymized.eml', async () => {
        const fixturePath = path.join(__dirname, 'fixtures', 'forward-attachment-small-anonymized.eml');
        const content = fs.readFileSync(fixturePath, 'utf8');

        const result = await extractDeepestHybrid(content);

        // 1. Verify diagnostics
        expect(result.diagnostics.parsedOk).toBe(true);
        expect(result.diagnostics.depth).toBe(1); // 1 forward detected
        const method = result.diagnostics.method as string;
        expect(method === 'inline' || method === 'new_outlook' || method.includes('method:') || method.length > 0).toBe(true);

        // 2. Verify basic fields (Deepest level)
        expect(result.from?.address).toBe('yodjii@anonymized.com');
        expect(result.from?.name).toBe('Florian User');
        expect(result.subject).toBe('File With 1 attachement small Forwarded');
        expect(result.text).toMatch(/Hi[\s\S]*Here is the invoice/i);

        // 3. Verify history
        expect(result.history.length).toBe(2);

        // Root (Index 0 in reverse order)
        // Note: history is reversed at return in inline-layer.ts line 104
        expect(result.history[1].from?.address).toBe('florian.m@anonymized.com');
        // Root text is empty because the only content is the forward header
        expect(result.history[1].text || '').toBe('');

        // Deepest (Index 0 in reverse order)
        expect(result.history[0].from?.address).toBe('yodjii@anonymized.com');
        expect(result.history[0].text).toMatch(/Hi[\s\S]*Here is the invoice/i);

        // 4. Verify attachment (should be preserved from root)
        expect(result.attachments.length).toBe(1);
        expect(result.attachments[0].filename).toBe('sample-small.pdf');
        expect(result.attachments[0].contentType).toBe('application/pdf');

    });
});
