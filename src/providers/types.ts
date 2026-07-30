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

export type ParticipantIdentifier = {
    scheme: string;
    value: string;
    canonical: string;
};

export type ParticipantBusinessCard = {
    name: string;
    countryCode: string;
    language?: string;
    geographicalInformation?: string;
    websiteUrls?: string[];
    contacts?: {
        type?: string;
        name?: string;
        phoneNumber?: string;
        email?: string;
    }[];
    additionalInformation?: string;
    registrationDate?: string;
};

export type RegisterParticipantInput = {
    participantIdentifier: ParticipantIdentifier;
    businessCard: ParticipantBusinessCard;
    publishToDirectory: boolean;
};

export type ParticipantRegistrationResult = {
    registered: boolean;
    alreadyRegistered: boolean;
    partial: boolean;
    businessCardPublished: boolean;
    directoryPublished: boolean;
    providerRegistrationId?: string;
    providerDetails?: Record<string, unknown>;
    errors?: string[];
};

export type ParticipantRegistrationStatus = {
    registered: boolean;
    providerRegistrationId?: string;
    countryCode?: string;
    createdAt?: string;
    updatedAt?: string;
    providerDetails?: Record<string, unknown>;
};

export type ParticipantService = {
    documentTypeIdentifier: string;
    documentTypeScheme?: string;
    processIdentifier: string;
    processScheme?: string;
};

export interface PeppolProvider {
    readonly name: 'DOKAPI';
    sendDocument(input: ProviderSendInput): Promise<ProviderSendResult>;
    getParticipantRegistration(
        participantIdentifier: ParticipantIdentifier
    ): Promise<ParticipantRegistrationStatus>;
    registerParticipant(
        input: RegisterParticipantInput
    ): Promise<ParticipantRegistrationResult>;
    deregisterParticipant(
        participantIdentifier: ParticipantIdentifier
    ): Promise<void>;
    registerParticipantService(
        participantIdentifier: ParticipantIdentifier,
        service: ParticipantService
    ): Promise<Record<string, unknown> | undefined>;
    deregisterParticipantService(
        participantIdentifier: ParticipantIdentifier,
        documentTypeIdentifier: Pick<
            ParticipantService,
            'documentTypeIdentifier' | 'documentTypeScheme'
        >
    ): Promise<void>;
}

export type DokapiCredentials = {
    clientId: string;
    clientSecret: string;
    baseUrl: string;
    tokenUrl: string;
};
