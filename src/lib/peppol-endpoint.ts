const belgianEnterpriseNumberPattern = /^\d{10}$/;

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

export function canonicalEndpoint(endpoint: {
    scheme: string;
    id: string;
}): string {
    return `${endpoint.scheme.trim()}:${endpoint.id.trim()}`.toLowerCase();
}
