import type { NaptrRecord } from 'node:dns';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
    buildPeppolSmlDnsName,
    extractSmpBaseUrl,
    lookupPeppolParticipant,
} from '../src/peppol/discovery';

beforeAll(() => {
    process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
});

const dnsName =
    'Y7DZFXAF3D4CJZ4KCGRXTEC6TWVCGA4KY7ZWA5BOIF6MSWD4TDRQ.iso6523-actorid-upis.edelivery.tech.ec.europa.eu';

const naptrRecord: NaptrRecord = {
    flags: 'U',
    service: 'Meta:SMP',
    regexp: '!^.*$!https://smp.example.test/smpquery!',
    replacement: '.',
    order: 10,
    preference: 10,
};

describe('Peppol participant discovery', () => {
    it('implements the official SHA-256 and Base32 DNS example', () => {
        expect(
            buildPeppolSmlDnsName('0088:123abc', 'edelivery.tech.ec.europa.eu')
        ).toBe(dnsName);
    });

    it('selects only a valid Meta:SMP HTTPS U-NAPTR record', () => {
        expect(
            extractSmpBaseUrl(
                [
                    {
                        ...naptrRecord,
                        order: 1,
                        service: 'OTHER',
                    },
                    naptrRecord,
                ],
                dnsName
            )
        ).toBe('https://smp.example.test/smpquery');
        expect(
            extractSmpBaseUrl(
                [
                    {
                        ...naptrRecord,
                        regexp: '!^.*$!http://insecure.example.test!',
                    },
                ],
                dnsName
            )
        ).toBeNull();
    });

    it('returns registration and advertised document types from the SMP', async () => {
        const fetcher = vi.fn(() =>
            Promise.resolve(
                new Response(
                    `<?xml version="1.0" encoding="UTF-8"?>
<ServiceGroup xmlns="http://busdox.org/serviceMetadata/publishing/1.0/"
  xmlns:ids="http://busdox.org/transport/identifiers/1.0/">
  <ids:ParticipantIdentifier scheme="iso6523-actorid-upis">0088:123abc</ids:ParticipantIdentifier>
  <ServiceMetadataReferenceCollection>
    <ServiceMetadataReference href="https://smp.example.test/smpquery/participant/services/busdox-docid-qns%3A%3Aurn%3Atest%3Ainvoice"/>
    <ServiceMetadataReference href="https://smp.example.test/smpquery/participant/services/busdox-docid-qns%3A%3Aurn%3Atest%3Acredit-note"/>
  </ServiceMetadataReferenceCollection>
</ServiceGroup>`,
                    {
                        headers: { 'content-type': 'application/xml' },
                    }
                )
            )
        );

        const result = await lookupPeppolParticipant('0088:123ABC', {
            smlDomain: 'edelivery.tech.ec.europa.eu',
            resolveNaptr: () => Promise.resolve([naptrRecord]),
            fetch: fetcher,
        });

        expect(result.registered).toBe(true);
        expect(result.participant.canonical).toBe('0088:123abc');
        expect(result.smp).toEqual({
            baseUrl: 'https://smp.example.test/smpquery',
            serviceCount: 2,
        });
        expect(result.documentTypes).toEqual([
            { scheme: 'busdox-docid-qns', value: 'urn:test:credit-note' },
            { scheme: 'busdox-docid-qns', value: 'urn:test:invoice' },
        ]);
        expect(fetcher).toHaveBeenCalledWith(
            new URL(
                'https://smp.example.test/smpquery/iso6523-actorid-upis%3A%3A0088%3A123abc'
            ),
            expect.objectContaining({
                headers: expect.objectContaining({
                    accept: 'application/xml, text/xml',
                }),
            })
        );
    });

    it('returns an unregistered participant when the SML has no DNS record', async () => {
        const error = Object.assign(new Error('not found'), {
            code: 'ENOTFOUND',
        });
        const result = await lookupPeppolParticipant('0208:0732788875', {
            resolveNaptr: () => Promise.reject(error),
        });

        expect(result.registered).toBe(false);
        expect(result.smp).toBeNull();
        expect(result.documentTypes).toEqual([]);
    });
});
