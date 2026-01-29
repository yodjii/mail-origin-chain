
import { extractDeepestHybrid } from '../src/index';
import { calculateConfidence } from '../src/scoring';

describe('Confidence Scoring System', () => {

    // Helper to simulate result body
    const createBody = (emails: string[]) => {
        return emails.map(e => `Some text <${e}> some text`).join('\n\n');
    };

    // Helper to simulate header context
    const createWithHeaders = (emails: string[]) => {
        return emails.map(e => `To: Previous <prev@mail.com>\nCc: <${e}>\nSubject: test`).join('\n\nWith content\n\n');
    };

    test('Standard Case (Ratio ~2.0) -> Score 100', () => {
        // Depth 2, 4 Emails (2 per level)
        const depth = 2;
        const body = createBody(['a@a.com', 'b@a.com', 'c@a.com', 'd@a.com']);

        const result = calculateConfidence(body, depth);
        expect(result.score).toBe(100);
        expect(result.description).toContain('Standard');
    });

    test('Partial Case (Ratio ~1.0) -> Score 50', () => {
        // Depth 3, 3 Emails (1 per level)
        const depth = 3;
        const body = createBody(['a@a.com', 'b@a.com', 'c@a.com']);

        const result = calculateConfidence(body, depth);
        expect(result.score).toBe(50);
        expect(result.description).toContain('Partial');
    });

    test('Ghost Case (Depth > 0, 0 Emails) -> Score 0', () => {
        const depth = 1;
        const body = "Just text without email patterns";

        const result = calculateConfidence(body, depth);
        expect(result.score).toBe(0);
        expect(result.description).toContain('Ghost');
    });

    test('High Density Header Chain (Ratio > 2.4 + Headers) -> Score 100', () => {
        // Depth 1, 5 Emails. Ratio 5.0. 
        // All emails have "Cc:" context
        const depth = 1;
        const body = createWithHeaders(['a@a.com', 'b@a.com', 'c@a.com', 'd@a.com', 'e@a.com']);

        const result = calculateConfidence(body, depth);
        expect(result.score).toBe(100);
        expect(result.description).toContain('High Density Header');
    });

    test('Suspect High Density (Missed Separator) -> Score 25', () => {
        // Depth 1, but found 2 "From:" headers implies we missed a level
        const depth = 1;
        const body = `
        From: user1 <a@a.com>
        To: user2 <b@a.com>
        
        Some text...
        
        From: user3 <c@a.com>
        To: user4 <d@a.com>
        `;

        const result = calculateConfidence(body, depth);
        expect(result.score).toBe(25);
        expect(result.description).toContain('Detected 2 senders');
    });

    test('Suspect High Density (Missed Inline/Gmail Separator) -> Score 25', () => {
        // Depth 1, but found 2 "On ... wrote:" patterns
        const depth = 1;
        const body = `
        On Mon, Jan 1, 2023 at 10:00 AM, User A <a@gmail.com> wrote:
        > Hey
        
        ...
        
        On Tue, Jan 2, 2023 at 11:00 AM, User B <b@gmail.com> wrote:
        > Double hey
        `;

        const result = calculateConfidence(body, depth);
        expect(result.score).toBe(25);
        expect(result.description).toContain('Detected 2 senders');
    });

    test('Suspect High Density (Ratio > 2.4 + No Headers) -> Score 25', () => {
        // Depth 1, 5 Emails scattered in text without headers
        const depth = 1;
        const body = createBody(['a@a.com', 'b@a.com', 'c@a.com', 'd@a.com', 'e@a.com']);

        const result = calculateConfidence(body, depth);
        expect(result.score).toBe(25);
        expect(result.description).toContain('Suspect');
    });

    test('Integration Test with Real Fixture', async () => {
        // forward-attachment-small-anonymized.eml is known to be Standard (Ratio 2.0)
        // We'll read it via extractDeepestHybrid to check integration
        const fs = require('fs');
        const path = require('path');
        const fixturePath = path.join(__dirname, 'fixtures', 'forward-attachment-small-anonymized.eml');
        const content = fs.readFileSync(fixturePath, 'utf8');

        const result = await extractDeepestHybrid(content);

        expect(result.confidence_score).toBe(100);
        expect(result.confidence_description).toContain('Standard');
    });
});
