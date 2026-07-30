const belgianEnterpriseNumberPattern = /^\d{10}$/;
const belgianVatNumberPattern = /^BE\d{10}$/;

/**
 * Normalizes a Belgian BCE/KBO or VAT number to its 10-digit enterprise number.
 */
export function normalizeBelgianEnterpriseNumber(value: string): string {
    const compact = value.replaceAll(/[\s.-]/g, '').toUpperCase();
    const withoutCountry = compact.startsWith('BE')
        ? compact.slice(2)
        : compact;

    if (!belgianEnterpriseNumberPattern.test(withoutCountry)) {
        throw new Error(
            'Belgian enterprise number must contain exactly 10 digits'
        );
    }
    return withoutCountry;
}

/**
 * Returns the canonical Belgian Peppol participant identifier.
 */
export function toBelgianPeppolEndpoint(value: string): {
    scheme: '0208';
    value: string;
    canonical: string;
} {
    const enterpriseNumber = normalizeBelgianEnterpriseNumber(value);
    return {
        scheme: '0208',
        value: enterpriseNumber,
        canonical: `0208:${enterpriseNumber}`,
    };
}

/**
 * Returns the canonical Peppol participant identifier for a Belgian VAT
 * number. Scheme 9925 is distinct from the 0208 enterprise-number scheme.
 */
export function toBelgianVatPeppolEndpoint(value: string): {
    scheme: '9925';
    value: string;
    canonical: string;
} {
    const compact = value.replaceAll(/[\s.-]/g, '').toUpperCase();
    if (!belgianVatNumberPattern.test(compact)) {
        throw new Error(
            'Belgian VAT participant identifier must contain BE followed by exactly 10 digits'
        );
    }
    const normalizedValue = compact.toLowerCase();
    return {
        scheme: '9925',
        value: normalizedValue,
        canonical: `9925:${normalizedValue}`,
    };
}

export function canonicalEndpoint(endpoint: {
    scheme: string;
    id: string;
}): string {
    return `${endpoint.scheme.trim()}:${endpoint.id.trim()}`.toLowerCase();
}

const peppolParticipantPattern = /^(\d{4}):([A-Z\d._~-]{1,130})$/i;

/**
 * Normalizes a generic Peppol Participant Identifier. Bare Belgian BCE/KBO or
 * VAT values are accepted as a convenience and mapped to scheme 0208.
 */
export function normalizePeppolParticipantIdentifier(value: string): {
    scheme: string;
    value: string;
    canonical: string;
} {
    const trimmed = value.trim();
    const candidate = trimmed.includes(':')
        ? trimmed
        : toBelgianPeppolEndpoint(trimmed).canonical;
    const match = peppolParticipantPattern.exec(candidate);
    if (!match) {
        throw new Error(
            'Peppol participant identifier must use <4-digit scheme>:<value> and contain only letters, digits, dot, underscore, tilde or hyphen'
        );
    }

    const [, scheme, rawValue] = match;
    const normalizedValue =
        scheme === '0208'
            ? normalizeBelgianEnterpriseNumber(rawValue!)
            : scheme === '9925'
              ? toBelgianVatPeppolEndpoint(rawValue!).value
              : rawValue!.toLowerCase();
    return {
        scheme: scheme!,
        value: normalizedValue,
        canonical: `${scheme}:${normalizedValue}`,
    };
}
