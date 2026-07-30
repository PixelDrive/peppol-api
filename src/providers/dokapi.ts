import type {
    DokapiCredentials,
    PeppolProvider,
    ProviderSendInput,
    ProviderSendResult,
} from './types';

type TokenCacheEntry = {
    accessToken: string;
    expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();

type OutgoingDocumentResponse = {
    id?: string;
    ulid?: string;
    preSignedUploadUrl?: string;
};

export class DokapiProvider implements PeppolProvider {
    readonly name = 'DOKAPI' as const;

    constructor(private readonly credentials: DokapiCredentials) {}

    private async getAccessToken(): Promise<string> {
        const cached = tokenCache.get(this.credentials.clientId);
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

        tokenCache.set(this.credentials.clientId, {
            accessToken: token.access_token,
            expiresAt: Date.now() + (token.expires_in ?? 300) * 1000,
        });
        return token.access_token;
    }

    /**
     * Reserves an outgoing Dokapi document and uploads its XML to the returned
     * pre-signed URL. Final delivery is reported asynchronously by webhook.
     */
    async sendDocument(input: ProviderSendInput): Promise<ProviderSendResult> {
        const token = await this.getAccessToken();
        const createResponse = await fetch(
            new URL(
                'outgoing-peppol-documents',
                `${this.credentials.baseUrl.replace(/\/?$/, '/')}`
            ),
            {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                },
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
                signal: AbortSignal.timeout(20_000),
            }
        );
        if (!createResponse.ok) {
            throw new Error(
                `Dokapi document reservation failed with status ${createResponse.status}: ${await createResponse.text()}`
            );
        }

        const outgoing =
            (await createResponse.json()) as OutgoingDocumentResponse;
        if (!outgoing.preSignedUploadUrl) {
            throw new Error('Dokapi response has no preSignedUploadUrl');
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
            providerDocumentId: outgoing.id ?? outgoing.ulid,
            status: 'PENDING',
        };
    }
}
