import { createHash } from 'node:crypto';
import type { NaptrRecord } from 'node:dns';
import { resolveNaptr } from 'node:dns/promises';
import { XMLParser } from 'fast-xml-parser';
import { getConfig } from '../config';
import { normalizePeppolParticipantIdentifier } from '../lib/peppol-endpoint';

const participantMetaScheme = 'iso6523-actorid-upis';
const maximumSmpResponseBytes = 2_000_000;
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type PeppolDocumentType = {
    scheme: string;
    value: string;
};

export type PeppolParticipantLookup = {
    participant: {
        metaScheme: typeof participantMetaScheme;
        scheme: string;
        value: string;
        canonical: string;
    };
    registered: boolean;
    sml: {
        domain: string;
        dnsName: string;
    };
    smp: {
        baseUrl: string;
        serviceCount: number;
    } | null;
    documentTypes: PeppolDocumentType[];
};

type NaptrResolver = (hostname: string) => Promise<NaptrRecord[]>;

export type PeppolDiscoveryDependencies = {
    resolveNaptr?: NaptrResolver;
    fetch?: typeof fetch;
    smlDomain?: string;
    timeoutMs?: number;
};

export class PeppolDiscoveryError extends Error {
    constructor(
        public readonly code:
            | 'DNS_LOOKUP_FAILED'
            | 'INVALID_SMP_RECORD'
            | 'SMP_UNAVAILABLE'
            | 'INVALID_SMP_RESPONSE',
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'PeppolDiscoveryError';
    }
}

function encodeBase32(bytes: Uint8Array): string {
    let bits = 0;
    let value = 0;
    let encoded = '';

    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            encoded += base32Alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        encoded += base32Alphabet[(value << (5 - bits)) & 31];
    }
    return encoded;
}

/**
 * Builds the SML DNS name defined by Peppol Policy for use of Identifiers 4.4:
 * Base32(SHA-256(lowercase participant identifier)) without padding.
 */
export function buildPeppolSmlDnsName(
    participantId: string,
    smlDomain: string
): string {
    const participant =
        normalizePeppolParticipantIdentifier(participantId).canonical;
    const digest = createHash('sha256')
        .update(participant.toLowerCase(), 'utf8')
        .digest();
    return `${encodeBase32(digest)}.${participantMetaScheme}.${smlDomain}`;
}

function splitNaptrRegexp(regexp: string): [string, string, string] | null {
    const delimiter = regexp[0];
    if (!delimiter || /[\d\\]/.test(delimiter)) {
        return null;
    }
    const fields: string[] = [];
    let current = '';
    let escaped = false;
    for (const character of regexp.slice(1)) {
        if (escaped) {
            current += `\\${character}`;
            escaped = false;
        } else if (character === '\\') {
            escaped = true;
        } else if (character === delimiter) {
            if (fields.length === 2) {
                return null;
            }
            fields.push(current);
            current = '';
        } else {
            current += character;
        }
    }
    if (escaped || fields.length !== 2) {
        return null;
    }
    return [fields[0]!, fields[1]!, current];
}

function applyNaptrRegexp(regexp: string, dnsName: string): string | null {
    const fields = splitNaptrRegexp(regexp);
    if (!fields) {
        return null;
    }
    const [pattern, rawReplacement, flags] = fields;
    if (!/^[iI]?$/.test(flags)) {
        return null;
    }
    try {
        const expression = new RegExp(pattern, flags.toLowerCase());
        if (!expression.test(dnsName)) {
            return null;
        }
        const replacement = rawReplacement.replaceAll(
            /\\(\d)/g,
            (_match, group: string) => `$${group}`
        );
        return dnsName.replace(expression, replacement);
    } catch {
        return null;
    }
}

function validateSmpBaseUrl(value: string): string | null {
    try {
        const url = new URL(value);
        if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            (url.port && url.port !== '443')
        ) {
            return null;
        }
        return url.toString().replace(/\/$/, '');
    } catch {
        return null;
    }
}

export function extractSmpBaseUrl(
    records: NaptrRecord[],
    dnsName: string
): string | null {
    const candidates = records
        .filter(
            (record) =>
                record.service.toLowerCase() === 'meta:smp' &&
                record.flags.toLowerCase() === 'u'
        )
        .toSorted(
            (left, right) =>
                left.order - right.order || left.preference - right.preference
        );

    for (const record of candidates) {
        const value = applyNaptrRegexp(record.regexp, dnsName);
        const validated = value ? validateSmpBaseUrl(value) : null;
        if (validated) {
            return validated;
        }
    }
    return null;
}

function isDnsNotFound(error: unknown): boolean {
    if (!(error instanceof Error) || !('code' in error)) {
        return false;
    }
    return ['ENODATA', 'ENOTFOUND'].includes(String(error.code).toUpperCase());
}

async function readLimitedXml(response: Response): Promise<string> {
    const declaredLength = Number(response.headers.get('content-length'));
    if (
        Number.isFinite(declaredLength) &&
        declaredLength > maximumSmpResponseBytes
    ) {
        throw new PeppolDiscoveryError(
            'INVALID_SMP_RESPONSE',
            'SMP response exceeds the maximum allowed size'
        );
    }
    if (!response.body) {
        return '';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let body = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            return body + decoder.decode();
        }
        total += value.byteLength;
        if (total > maximumSmpResponseBytes) {
            await reader.cancel();
            throw new PeppolDiscoveryError(
                'INVALID_SMP_RESPONSE',
                'SMP response exceeds the maximum allowed size'
            );
        }
        body += decoder.decode(value, { stream: true });
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function asArray(value: unknown): unknown[] {
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function extractText(value: unknown): string | null {
    if (typeof value === 'string') {
        return value.trim();
    }
    const record = asRecord(value);
    return typeof record?.['#text'] === 'string'
        ? record['#text'].trim()
        : null;
}

function parseDocumentTypeReference(href: unknown): PeppolDocumentType | null {
    if (typeof href !== 'string') {
        return null;
    }
    try {
        const path = new URL(href).pathname.split('/');
        const servicesIndex = path.lastIndexOf('services');
        const encodedIdentifier = path[servicesIndex + 1];
        if (servicesIndex < 0 || !encodedIdentifier) {
            return null;
        }
        const identifier = decodeURIComponent(encodedIdentifier);
        const separator = identifier.indexOf('::');
        if (separator <= 0 || separator === identifier.length - 2) {
            return null;
        }
        return {
            scheme: identifier.slice(0, separator),
            value: identifier.slice(separator + 2),
        };
    } catch {
        return null;
    }
}

function parseServiceGroup(
    xml: string,
    expectedParticipantId: string
): PeppolDocumentType[] {
    let parsed: unknown;
    try {
        parsed = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            removeNSPrefix: true,
            parseTagValue: false,
            processEntities: false,
            trimValues: true,
        }).parse(xml);
    } catch (error) {
        throw new PeppolDiscoveryError(
            'INVALID_SMP_RESPONSE',
            'SMP returned malformed XML',
            { cause: error }
        );
    }

    const serviceGroup = asRecord(asRecord(parsed)?.ServiceGroup);
    const participantElement = asRecord(serviceGroup?.ParticipantIdentifier);
    const participantId = extractText(
        participantElement ?? serviceGroup?.ParticipantIdentifier
    );
    const participantScheme = participantElement?.['@_scheme'];
    if (
        participantScheme !== participantMetaScheme ||
        participantId?.toLowerCase() !== expectedParticipantId.toLowerCase()
    ) {
        throw new PeppolDiscoveryError(
            'INVALID_SMP_RESPONSE',
            'SMP ServiceGroup does not match the requested participant'
        );
    }

    const collection = asRecord(
        serviceGroup?.ServiceMetadataReferenceCollection
    );
    const references = asArray(collection?.ServiceMetadataReference);
    const documentTypes = references.map((reference) =>
        parseDocumentTypeReference(asRecord(reference)?.['@_href'])
    );
    if (documentTypes.includes(null)) {
        throw new PeppolDiscoveryError(
            'INVALID_SMP_RESPONSE',
            'SMP ServiceGroup contains an invalid service metadata reference'
        );
    }
    const validDocumentTypes = documentTypes.filter(
        (documentType): documentType is PeppolDocumentType =>
            documentType !== null
    );
    return [
        ...new Map(
            validDocumentTypes.map((documentType) => [
                `${documentType.scheme}::${documentType.value}`,
                documentType,
            ])
        ).values(),
    ].toSorted((left, right) =>
        `${left.scheme}::${left.value}`.localeCompare(
            `${right.scheme}::${right.value}`
        )
    );
}

/**
 * Looks up a participant directly through the Peppol SML and SMP, independently
 * from any configured access-point provider.
 */
export async function lookupPeppolParticipant(
    participantId: string,
    dependencies: PeppolDiscoveryDependencies = {}
): Promise<PeppolParticipantLookup> {
    const config = getConfig();
    const participant = normalizePeppolParticipantIdentifier(participantId);
    const smlDomain = dependencies.smlDomain ?? config.PEPPOL_SML_DOMAIN;
    const dnsName = buildPeppolSmlDnsName(participant.canonical, smlDomain);
    const resolver = dependencies.resolveNaptr ?? resolveNaptr;

    let records: NaptrRecord[];
    try {
        records = await resolver(dnsName);
    } catch (error) {
        if (isDnsNotFound(error)) {
            return {
                participant: {
                    metaScheme: participantMetaScheme,
                    ...participant,
                },
                registered: false,
                sml: { domain: smlDomain, dnsName },
                smp: null,
                documentTypes: [],
            };
        }
        throw new PeppolDiscoveryError(
            'DNS_LOOKUP_FAILED',
            'Unable to query the Peppol SML',
            { cause: error }
        );
    }

    const smpBaseUrl = extractSmpBaseUrl(records, dnsName);
    if (!smpBaseUrl) {
        throw new PeppolDiscoveryError(
            'INVALID_SMP_RECORD',
            'Peppol SML did not return a valid Meta:SMP HTTPS record'
        );
    }

    const serviceGroupUrl = new URL(
        `${smpBaseUrl}/${encodeURIComponent(
            `${participantMetaScheme}::${participant.canonical}`
        )}`
    );
    const fetcher = dependencies.fetch ?? fetch;
    let response: Response;
    try {
        response = await fetcher(serviceGroupUrl, {
            headers: {
                accept: 'application/xml, text/xml',
                'user-agent': 'peppol-hono-api-discovery/1.0',
            },
            signal: AbortSignal.timeout(
                dependencies.timeoutMs ?? config.PEPPOL_LOOKUP_TIMEOUT_MS
            ),
        });
    } catch (error) {
        throw new PeppolDiscoveryError(
            'SMP_UNAVAILABLE',
            'Unable to reach the participant SMP',
            { cause: error }
        );
    }
    if (!response.ok) {
        throw new PeppolDiscoveryError(
            response.status === 404
                ? 'INVALID_SMP_RESPONSE'
                : 'SMP_UNAVAILABLE',
            `Participant SMP returned HTTP ${response.status}`
        );
    }

    const documentTypes = parseServiceGroup(
        await readLimitedXml(response),
        participant.canonical
    );
    return {
        participant: {
            metaScheme: participantMetaScheme,
            ...participant,
        },
        registered: true,
        sml: { domain: smlDomain, dnsName },
        smp: {
            baseUrl: smpBaseUrl,
            serviceCount: documentTypes.length,
        },
        documentTypes,
    };
}
