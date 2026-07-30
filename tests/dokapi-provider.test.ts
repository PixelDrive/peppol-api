import { afterEach, describe, expect, it, vi } from 'vitest';
import { DokapiProvider } from '../src/providers/dokapi';

describe('Dokapi provider', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses the sender country from the final UBL metadata', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    /* eslint-disable camelcase -- Dokapi OAuth wire names */
                    access_token: 'access-token',
                    expires_in: 300,
                    /* eslint-enable camelcase */
                })
            )
            .mockResolvedValueOnce(
                Response.json({
                    id: 'document-id',
                    preSignedUploadUrl: 'https://uploads.example/document.xml',
                })
            )
            .mockResolvedValueOnce(new Response(undefined, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const provider = new DokapiProvider({
            clientId: 'country-test-client',
            clientSecret: 'secret',
            baseUrl: 'https://dokapi.example/v1',
            tokenUrl: 'https://dokapi.example/oauth/token',
        });
        await provider.sendDocument({
            ublXml: '<Invoice />',
            type: 'INVOICE',
            senderEndpoint: '0106:123456789',
            receiverEndpoint: '0208:0732788874',
            senderCountryCode: 'NL',
            externalReference: 'reference',
        });

        const reservationRequest = fetchMock.mock.calls[1]?.[1];
        expect(JSON.parse(String(reservationRequest?.body))).toMatchObject({
            sender: { value: '0106:123456789' },
            c1CountryCode: 'NL',
        });
    });
});
