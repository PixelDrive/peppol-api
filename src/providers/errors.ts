/** Error returned by a provider API without exposing credentials or headers. */
export class PeppolProviderRequestError extends Error {
    constructor(
        readonly provider: string,
        readonly status: number,
        readonly details?: Record<string, unknown>
    ) {
        super(
            `${provider} request failed with status ${status}: ${JSON.stringify(details ?? {})}`
        );
        this.name = 'PeppolProviderRequestError';
    }
}
