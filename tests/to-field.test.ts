import { extractDeepestHybrid } from '../src/index';

describe('To Field Extraction', () => {
    it('should extract To field from a simple forward', async () => {
        const raw = `---------- Forwarded message ---------
From: Alice <alice@example.com>
Date: Wed, 29 Jan 2026 10:00:00 +0100
Subject: Test Forward
To: Bob <bob@example.com>

Hello Bob!`;
        const result = await extractDeepestHybrid(raw, { skipMimeLayer: true });

        expect(result.to).toBeDefined();
        expect(result.to?.address).toBe('bob@example.com');
        expect(result.to?.name).toBe('Bob');

        expect(result.history.length).toBe(2);
        expect(result.history[0].to?.address).toBe('bob@example.com');
    });

    it('should extract To field from Outlook format', async () => {
        const raw = `De : Alice <alice@example.com>
Envoyé : mercredi 29 janvier 2026 10:00
À : Bob <bob@example.com>
Objet : Test Outlook

Hello Bob!`;
        const result = await extractDeepestHybrid(raw, { skipMimeLayer: true });

        expect(result.to?.address).toBe('bob@example.com');
    });

    it('should extract To field from OutlookEmptyHeader format', async () => {
        const raw = `________________________________
De: Alice M.
Envoyé: 
À: Bob M. <bob@example.com>
Objet: RE: Test

Hello Bob!`;
        const result = await extractDeepestHybrid(raw, { skipMimeLayer: true });

        expect(result.to?.address).toBe('bob@example.com');
        expect(result.diagnostics.method).toBe('outlook_empty_header');
    });

    it('should extract To field from OutlookReverseFr format', async () => {
        const raw = `Envoyé : mercredi 29 janvier 2026 10:00
De : Alice <alice@example.com>
À : Bob <bob@example.com>
Objet : Test Reverse

Hello Bob!`;
        const result = await extractDeepestHybrid(raw, { skipMimeLayer: true });

        expect(result.to?.address).toBe('bob@example.com');
        expect(result.diagnostics.method).toBe('outlook_reverse_fr');
    });

    it('should extract To field from full MIME (EML)', async () => {
        const raw = `From: Alice <alice@example.com>
To: Bob <bob@example.com>
Date: Wed, 29 Jan 2026 10:00:00 +0000
Subject: Test MIME
Content-Type: text/plain

Hello Bob!`;
        const result = await extractDeepestHybrid(raw, { skipMimeLayer: false });

        expect(result.to?.address).toBe('bob@example.com');
        expect(result.history.length).toBe(1);
        expect(result.history[0].to?.address).toBe('bob@example.com');
    });
});
