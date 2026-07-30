import type {
    DokapiCredentials,
    ParticipantBusinessCard,
    ParticipantIdentifier,
    ParticipantRegistrationResult,
    ParticipantRegistrationStatus,
    ParticipantService,
    PeppolProvider,
    ProviderSendInput,
    ProviderSendResult,
    RegisterParticipantInput,
} from './types';
import { PeppolProviderRequestError } from './errors';

type TokenCacheEntry = {
    accessToken: string;
    expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();
const peppolParticipantScheme = 'iso6523-actorid-upis';

type DokapiOutgoingDocument = {
    ulid?: string;
};

type CreateOutgoingDocumentResponse = {
    document?: DokapiOutgoingDocument;
    preSignedUploadUrl?: string;
};

type DokapiParticipantRegistration = {
    ulid?: string;
    countryCode?: string;
    creationTimestamp?: string;
    lastModifiedTimestamp?: string;
    participantIdentifier?: { scheme?: string; value?: string };
};

type DokapiRegistrationResponse = {
    participantRegistrationSuccessful?: boolean;
    businessCardSuccessful?: boolean;
    participantRegistration?: DokapiParticipantRegistration;
    [key: string]: unknown;
};

function participantIdentifierBody(identifier: ParticipantIdentifier): {
    scheme: string;
    value: string;
} {
    return {
        scheme: peppolParticipantScheme,
        value: identifier.canonical,
    };
}

function completeBusinessCardBody(businessCard: ParticipantBusinessCard): {
    businessEntity: Record<string, unknown>[];
} {
    return {
        businessEntity: [
            {
                name: [
                    {
                        value: businessCard.name,
                        ...(businessCard.language
                            ? { language: businessCard.language }
                            : {}),
                    },
                ],
                countryCode: businessCard.countryCode,
                geographicalInformation: businessCard.geographicalInformation,
                websiteUri: businessCard.websiteUrls,
                contact: businessCard.contacts,
                additionalInformation: businessCard.additionalInformation,
                registrationDate: businessCard.registrationDate,
            },
        ],
    };
}

async function responseBody(
    response: Response
): Promise<Record<string, unknown> | undefined> {
    const text = await response.text();
    if (!text) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : { value: parsed };
    } catch {
        return { message: text.slice(0, 2000) };
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export class DokapiProvider implements PeppolProvider {
    readonly name = 'DOKAPI' as const;

    constructor(private readonly credentials: DokapiCredentials) {}

    private get baseUrl(): string {
        return this.credentials.baseUrl.replace(/\/?$/, '/');
    }

    private async getAccessToken(): Promise<string> {
        const cacheKey = `${this.credentials.tokenUrl}:${this.credentials.clientId}`;
        const cached = tokenCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now() + 60_000) {
            return cached.accessToken;
        }

        const response = await fetch(this.credentials.tokenUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                /* eslint-disable camelcase -- Dokapi OAuth wire names */
                grant_type: 'client_credentials',
                client_id: this.credentials.clientId,
                client_secret: this.credentials.clientSecret,
                /* eslint-enable camelcase */
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            throw new Error(
                `Dokapi OAuth failed with status ${response.status}`
            );
        }

        const token = (await response.json()) as {
            access_token?: string;
            expires_in?: number;
        };
        if (!token.access_token) {
            throw new Error('Dokapi OAuth response has no access_token');
        }

        tokenCache.set(cacheKey, {
            accessToken: token.access_token,
            expiresAt: Date.now() + (token.expires_in ?? 300) * 1000,
        });
        return token.access_token;
    }

    private async request(
        path: string,
        init: RequestInit,
        expectedStatuses: number[],
        timeout = 60_000
    ): Promise<Response> {
        const response = await fetch(new URL(path, this.baseUrl), {
            ...init,
            headers: {
                authorization: `Bearer ${await this.getAccessToken()}`,
                'content-type': 'application/json',
                ...init.headers,
            },
            signal: AbortSignal.timeout(timeout),
        });
        if (!expectedStatuses.includes(response.status)) {
            const body = await responseBody(response);
            throw new PeppolProviderRequestError(
                this.name,
                response.status,
                body
            );
        }
        return response;
    }

    /**
     * Reserves an outgoing Dokapi document and uploads its XML to the returned
     * pre-signed URL. Final delivery is reported asynchronously by webhook.
     */
    async sendDocument(input: ProviderSendInput): Promise<ProviderSendResult> {
        const createResponse = await this.request(
            'outgoing-peppol-documents',
            {
                method: 'POST',
                body: JSON.stringify({
                    sender: { value: input.senderEndpoint },
                    receiver: { value: input.receiverEndpoint },
                    c1CountryCode: input.senderCountryCode,
                    documentTypeIdentifier: {
                        value:
                            input.type === 'INVOICE'
                                ? 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1'
                                : 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1',
                    },
                    processIdentifier: {
                        value: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
                    },
                    externalReference: input.externalReference,
                }),
            },
            [200, 201]
        );

        const outgoing =
            (await createResponse.json()) as CreateOutgoingDocumentResponse;
        if (!outgoing.preSignedUploadUrl) {
            throw new Error('Dokapi response has no preSignedUploadUrl');
        }
        if (!outgoing.document?.ulid) {
            throw new Error('Dokapi response has no document.ulid');
        }

        const uploadResponse = await fetch(outgoing.preSignedUploadUrl, {
            method: 'PUT',
            headers: { 'content-type': 'application/xml' },
            body: input.ublXml,
            signal: AbortSignal.timeout(30_000),
        });
        if (!uploadResponse.ok) {
            throw new Error(
                `Dokapi document upload failed with status ${uploadResponse.status}`
            );
        }

        return {
            providerDocumentId: outgoing.document.ulid,
            status: 'PENDING',
        };
    }

    async getParticipantRegistration(
        participantIdentifier: ParticipantIdentifier
    ): Promise<ParticipantRegistrationStatus> {
        const url = new URL('participant-registrations/find', this.baseUrl);
        url.searchParams.set('scheme', peppolParticipantScheme);
        url.searchParams.set('value', participantIdentifier.canonical);
        const response = await this.request(url.toString(), {}, [200, 404]);
        if (response.status === 404) {
            return { registered: false };
        }

        const registration =
            (await response.json()) as DokapiParticipantRegistration;
        return {
            registered: true,
            providerRegistrationId: registration.ulid,
            countryCode: registration.countryCode,
            createdAt: registration.creationTimestamp,
            updatedAt: registration.lastModifiedTimestamp,
            providerDetails: registration as Record<string, unknown>,
        };
    }

    /**
     * Creates the SMP participant and business card, or refreshes the business
     * card when the participant is already owned by the Dokapi client.
     */
    async registerParticipant(
        input: RegisterParticipantInput
    ): Promise<ParticipantRegistrationResult> {
        const identifier = participantIdentifierBody(
            input.participantIdentifier
        );
        const completeBusinessCard = completeBusinessCardBody(
            input.businessCard
        );
        const existing = await this.getParticipantRegistration(
            input.participantIdentifier
        );

        let registration: DokapiParticipantRegistration | undefined;
        let providerDetails: Record<string, unknown> | undefined;
        let businessCardPublished = true;
        let partial = false;
        const errors: string[] = [];

        if (existing.registered) {
            registration = {
                ulid: existing.providerRegistrationId,
                countryCode: existing.countryCode,
                creationTimestamp: existing.createdAt,
                lastModifiedTimestamp: existing.updatedAt,
            };
            try {
                const response = await this.request(
                    'participant-registrations/business-cards',
                    {
                        method: 'PUT',
                        body: JSON.stringify({
                            participantIdentifier: identifier,
                            completeBusinessCard,
                        }),
                    },
                    [200]
                );
                providerDetails = await responseBody(response);
            } catch (error) {
                businessCardPublished = false;
                partial = true;
                errors.push(errorMessage(error));
            }
        } else {
            const response = await this.request(
                'participant-registrations',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        participantIdentifier: identifier,
                        countryCode: input.businessCard.countryCode,
                        completeBusinessCard,
                    }),
                },
                [201, 207]
            );
            providerDetails = await responseBody(response);
            if (response.status === 207) {
                businessCardPublished = false;
                partial = true;
                errors.push(
                    'Dokapi registered the participant but failed to publish its business card.'
                );
            } else {
                const result = providerDetails as DokapiRegistrationResponse;
                registration = result.participantRegistration;
                businessCardPublished = result.businessCardSuccessful !== false;
                partial =
                    result.participantRegistrationSuccessful === false ||
                    !businessCardPublished;
            }
        }

        let directoryPublished = false;
        if (input.publishToDirectory && businessCardPublished) {
            try {
                await this.request(
                    'participant-registrations/business-cards/push',
                    {
                        method: 'POST',
                        body: JSON.stringify(identifier),
                    },
                    [200, 201]
                );
                directoryPublished = true;
            } catch (error) {
                partial = true;
                errors.push(errorMessage(error));
            }
        }

        return {
            registered: true,
            alreadyRegistered: existing.registered,
            partial,
            businessCardPublished,
            directoryPublished,
            providerRegistrationId:
                registration?.ulid ?? existing.providerRegistrationId,
            providerDetails,
            errors: errors.length > 0 ? errors : undefined,
        };
    }

    async deregisterParticipant(
        participantIdentifier: ParticipantIdentifier
    ): Promise<void> {
        await this.request(
            'participant-registrations',
            {
                method: 'DELETE',
                body: JSON.stringify(
                    participantIdentifierBody(participantIdentifier)
                ),
            },
            [200, 404]
        );
    }

    async registerParticipantService(
        participantIdentifier: ParticipantIdentifier,
        service: ParticipantService
    ): Promise<Record<string, unknown> | undefined> {
        const response = await this.request(
            'participant-registrations/documents',
            {
                method: 'POST',
                body: JSON.stringify({
                    participantIdentifier: participantIdentifierBody(
                        participantIdentifier
                    ),
                    documentTypeIdentifier: {
                        scheme:
                            service.documentTypeScheme ?? 'busdox-docid-qns',
                        value: service.documentTypeIdentifier,
                    },
                    processIdentifier: {
                        scheme: service.processScheme ?? 'cenbii-procid-ubl',
                        value: service.processIdentifier,
                    },
                }),
            },
            [201]
        );
        return responseBody(response);
    }

    async deregisterParticipantService(
        participantIdentifier: ParticipantIdentifier,
        documentTypeIdentifier: Pick<
            ParticipantService,
            'documentTypeIdentifier' | 'documentTypeScheme'
        >
    ): Promise<void> {
        await this.request(
            'participant-registrations/documents',
            {
                method: 'DELETE',
                body: JSON.stringify({
                    participantIdentifier: participantIdentifierBody(
                        participantIdentifier
                    ),
                    documentTypeIdentifier: {
                        scheme:
                            documentTypeIdentifier.documentTypeScheme ??
                            'busdox-docid-qns',
                        value: documentTypeIdentifier.documentTypeIdentifier,
                    },
                }),
            },
            [200, 404]
        );
    }
}
