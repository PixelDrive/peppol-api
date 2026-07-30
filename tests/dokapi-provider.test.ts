import { afterEach, describe, expect, it, vi } from 'vitest';
import { DokapiProvider } from '../src/providers/dokapi';

describe('Dokapi provider', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('maps final UBL metadata and uploads the exact XML', async () => {
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
                    document: { ulid: 'document-id' },
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
        const ublXml = '<Invoice id="exact-upload" />';
        const result = await provider.sendDocument({
            ublXml,
            type: 'INVOICE',
            senderEndpoint: '0106:123456789',
            receiverEndpoint: '0208:0732788874',
            senderCountryCode: 'NL',
            externalReference: 'reference',
        });

        expect(result).toEqual({
            providerDocumentId: 'document-id',
            status: 'PENDING',
        });
        const reservationRequest = fetchMock.mock.calls[1]?.[1];
        expect(JSON.parse(String(reservationRequest?.body))).toMatchObject({
            sender: { value: '0106:123456789' },
            c1CountryCode: 'NL',
        });
        const uploadCall = fetchMock.mock.calls[2];
        expect(uploadCall?.[0]).toBe('https://uploads.example/document.xml');
        expect(uploadCall?.[1]).toMatchObject({
            method: 'PUT',
            headers: { 'content-type': 'application/xml' },
            body: ublXml,
        });
    });

    it('rejects a create-document response without the documented document ULID', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    /* eslint-disable camelcase -- Dokapi OAuth wire names */
                    access_token: 'malformed-response-token',
                    expires_in: 300,
                    /* eslint-enable camelcase */
                })
            )
            .mockResolvedValueOnce(
                Response.json({
                    document: {},
                    preSignedUploadUrl: 'https://uploads.example/document.xml',
                })
            );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new DokapiProvider({
            clientId: 'malformed-response-client',
            clientSecret: 'secret',
            baseUrl: 'https://dokapi.example/v1',
            tokenUrl: 'https://dokapi.example/oauth/token',
        });

        await expect(
            provider.sendDocument({
                ublXml: '<Invoice />',
                type: 'INVOICE',
                senderEndpoint: '0106:123456789',
                receiverEndpoint: '0208:0732788874',
                senderCountryCode: 'NL',
                externalReference: 'reference',
            })
        ).rejects.toThrow('Dokapi response has no document.ulid');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('registers a participant, its business card and a document service', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    /* eslint-disable camelcase -- Dokapi OAuth wire names */
                    access_token: 'registration-token',
                    expires_in: 300,
                    /* eslint-enable camelcase */
                })
            )
            .mockResolvedValueOnce(new Response(undefined, { status: 404 }))
            .mockResolvedValueOnce(
                Response.json(
                    {
                        participantRegistrationSuccessful: true,
                        businessCardSuccessful: true,
                        participantRegistration: {
                            ulid: 'registration-id',
                            countryCode: 'BE',
                        },
                    },
                    { status: 201 }
                )
            )
            .mockResolvedValueOnce(new Response('published', { status: 200 }))
            .mockResolvedValueOnce(
                Response.json({ message: 'registered' }, { status: 201 })
            );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new DokapiProvider({
            clientId: 'participant-registration-client',
            clientSecret: 'secret',
            baseUrl: 'https://dokapi.example/v1',
            tokenUrl: 'https://dokapi.example/oauth/token',
        });
        const participantIdentifier = {
            scheme: '0208',
            value: '0732788874',
            canonical: '0208:0732788874',
        };
        const registration = await provider.registerParticipant({
            participantIdentifier,
            businessCard: {
                name: 'Example SRL',
                countryCode: 'BE',
                language: 'en',
                websiteUrls: ['https://example.com'],
            },
            publishToDirectory: true,
        });
        await provider.registerParticipantService(participantIdentifier, {
            documentTypeIdentifier: 'invoice-document-type',
            processIdentifier: 'billing-process',
        });

        expect(registration).toMatchObject({
            registered: true,
            alreadyRegistered: false,
            partial: false,
            businessCardPublished: true,
            directoryPublished: true,
            providerRegistrationId: 'registration-id',
        });

        const registrationCall = fetchMock.mock.calls[2];
        expect(String(registrationCall?.[0])).toBe(
            'https://dokapi.example/v1/participant-registrations'
        );
        expect(JSON.parse(String(registrationCall?.[1]?.body))).toMatchObject({
            participantIdentifier: {
                scheme: 'iso6523-actorid-upis',
                value: '0208:0732788874',
            },
            countryCode: 'BE',
            completeBusinessCard: {
                businessEntity: [
                    {
                        name: [{ value: 'Example SRL', language: 'en' }],
                        countryCode: 'BE',
                        websiteUri: ['https://example.com'],
                    },
                ],
            },
        });

        const serviceCall = fetchMock.mock.calls[4];
        expect(String(serviceCall?.[0])).toBe(
            'https://dokapi.example/v1/participant-registrations/documents'
        );
        expect(JSON.parse(String(serviceCall?.[1]?.body))).toMatchObject({
            participantIdentifier: {
                value: '0208:0732788874',
            },
            documentTypeIdentifier: {
                scheme: 'busdox-docid-qns',
                value: 'invoice-document-type',
            },
            processIdentifier: {
                scheme: 'cenbii-procid-ubl',
                value: 'billing-process',
            },
        });
    });

    it('updates the business card when the participant is already registered', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    /* eslint-disable camelcase -- Dokapi OAuth wire names */
                    access_token: 'existing-registration-token',
                    expires_in: 300,
                    /* eslint-enable camelcase */
                })
            )
            .mockResolvedValueOnce(
                Response.json({
                    ulid: 'existing-registration-id',
                    countryCode: 'BE',
                })
            )
            .mockResolvedValueOnce(
                Response.json({ message: 'business card updated' })
            );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new DokapiProvider({
            clientId: 'existing-participant-client',
            clientSecret: 'secret',
            baseUrl: 'https://dokapi.example/v1',
            tokenUrl: 'https://dokapi.example/oauth/token',
        });
        const result = await provider.registerParticipant({
            participantIdentifier: {
                scheme: '0208',
                value: '0732788874',
                canonical: '0208:0732788874',
            },
            businessCard: {
                name: 'Updated Example SRL',
                countryCode: 'BE',
            },
            publishToDirectory: false,
        });

        expect(result).toMatchObject({
            registered: true,
            alreadyRegistered: true,
            partial: false,
            businessCardPublished: true,
            directoryPublished: false,
            providerRegistrationId: 'existing-registration-id',
        });
        const updateCall = fetchMock.mock.calls[2];
        expect(String(updateCall?.[0])).toBe(
            'https://dokapi.example/v1/participant-registrations/business-cards'
        );
        expect(updateCall?.[1]?.method).toBe('PUT');
        expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
            participantIdentifier: {
                scheme: 'iso6523-actorid-upis',
                value: '0208:0732788874',
            },
            completeBusinessCard: {
                businessEntity: [
                    {
                        name: [{ value: 'Updated Example SRL' }],
                        countryCode: 'BE',
                    },
                ],
            },
        });
    });

    it('reports Dokapi partial success when business card creation fails', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    /* eslint-disable camelcase -- Dokapi OAuth wire names */
                    access_token: 'partial-token',
                    expires_in: 300,
                    /* eslint-enable camelcase */
                })
            )
            .mockResolvedValueOnce(new Response(undefined, { status: 404 }))
            .mockResolvedValueOnce(
                Response.json(
                    { detail: 'Business card failed' },
                    { status: 207 }
                )
            );
        vi.stubGlobal('fetch', fetchMock);

        const provider = new DokapiProvider({
            clientId: 'partial-registration-client',
            clientSecret: 'secret',
            baseUrl: 'https://dokapi.example/v1',
            tokenUrl: 'https://dokapi.example/oauth/token',
        });
        const result = await provider.registerParticipant({
            participantIdentifier: {
                scheme: '0208',
                value: '0732788874',
                canonical: '0208:0732788874',
            },
            businessCard: {
                name: 'Example SRL',
                countryCode: 'BE',
            },
            publishToDirectory: true,
        });

        expect(result).toMatchObject({
            registered: true,
            partial: true,
            businessCardPublished: false,
            directoryPublished: false,
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('reads registration state and maps service and participant deregistration', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    /* eslint-disable camelcase -- Dokapi OAuth wire names */
                    access_token: 'lifecycle-token',
                    expires_in: 300,
                    /* eslint-enable camelcase */
                })
            )
            .mockResolvedValueOnce(
                Response.json({
                    ulid: 'registration-id',
                    countryCode: 'NL',
                    creationTimestamp: '2026-01-01T00:00:00.000Z',
                    lastModifiedTimestamp: '2026-01-02T00:00:00.000Z',
                })
            )
            .mockResolvedValueOnce(new Response('removed', { status: 200 }))
            .mockResolvedValueOnce(new Response('removed', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const provider = new DokapiProvider({
            clientId: 'participant-lifecycle-client',
            clientSecret: 'secret',
            baseUrl: 'https://dokapi.example/v1',
            tokenUrl: 'https://dokapi.example/oauth/token',
        });
        const participantIdentifier = {
            scheme: '0106',
            value: '123456789',
            canonical: '0106:123456789',
        };

        await expect(
            provider.getParticipantRegistration(participantIdentifier)
        ).resolves.toMatchObject({
            registered: true,
            providerRegistrationId: 'registration-id',
            countryCode: 'NL',
        });
        await provider.deregisterParticipantService(participantIdentifier, {
            documentTypeIdentifier: 'invoice-document-type',
        });
        await provider.deregisterParticipant(participantIdentifier);

        const serviceRemoval = fetchMock.mock.calls[2];
        expect(serviceRemoval?.[1]?.method).toBe('DELETE');
        expect(JSON.parse(String(serviceRemoval?.[1]?.body))).toMatchObject({
            participantIdentifier: {
                scheme: 'iso6523-actorid-upis',
                value: '0106:123456789',
            },
            documentTypeIdentifier: {
                scheme: 'busdox-docid-qns',
                value: 'invoice-document-type',
            },
        });

        const participantRemoval = fetchMock.mock.calls[3];
        expect(participantRemoval?.[1]?.method).toBe('DELETE');
        expect(JSON.parse(String(participantRemoval?.[1]?.body))).toEqual({
            scheme: 'iso6523-actorid-upis',
            value: '0106:123456789',
        });
    });
});
