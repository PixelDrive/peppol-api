export type ProviderSendInput = {
    ublXml: string;
    type: 'INVOICE' | 'CREDIT_NOTE';
    senderEndpoint: string;
    receiverEndpoint: string;
    senderCountryCode: string;
    externalReference: string;
};

export type ProviderSendResult = {
    providerDocumentId?: string;
    status: 'PENDING' | 'SENT';
};

export interface PeppolProvider {
    readonly name: 'DOKAPI';
    sendDocument(input: ProviderSendInput): Promise<ProviderSendResult>;
}

export type DokapiCredentials = {
    clientId: string;
    clientSecret: string;
    baseUrl: string;
    tokenUrl: string;
};
