import { z } from 'zod';
import { toBelgianPeppolEndpoint } from '../../../lib/peppol-endpoint';

export const dokapiCredentialsSchema = z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    baseUrl: z.url(),
    tokenUrl: z.url().optional(),
});

type EndpointNormalization =
    | { endpoint: string; error?: never }
    | { endpoint?: never; error: string };

function normalizeCompanyNumber(value: string): EndpointNormalization {
    try {
        return { endpoint: toBelgianPeppolEndpoint(value).canonical };
    } catch (error) {
        return {
            error:
                error instanceof Error
                    ? error.message
                    : 'Invalid Belgian enterprise number',
        };
    }
}

function normalizeVatNumber(value: string): EndpointNormalization {
    const compactVat = value.replaceAll(/[\s.-]/g, '').toUpperCase();
    if (compactVat.startsWith('BE')) {
        return normalizeCompanyNumber(compactVat);
    }
    return { error: 'Belgian VAT number must start with BE' };
}

export const enterpriseInputSchema = z
    .object({
        name: z.string().trim().min(1).max(200),
        companyNumber: z.string().trim().optional(),
        vatNumber: z.string().trim().optional(),
        provider: z.literal('DOKAPI').default('DOKAPI'),
        useGlobalProviderCredentials: z.boolean().default(true),
        providerCredentials: dokapiCredentialsSchema.optional(),
    })
    .superRefine((value, context) => {
        if (
            value.companyNumber === undefined &&
            value.vatNumber === undefined
        ) {
            context.addIssue({
                code: 'custom',
                message: 'companyNumber or Belgian vatNumber is required',
                path: ['companyNumber'],
            });
        }

        const companyResult = value.companyNumber
            ? normalizeCompanyNumber(value.companyNumber)
            : undefined;
        const vatResult = value.vatNumber
            ? normalizeVatNumber(value.vatNumber)
            : undefined;

        if (companyResult?.error) {
            context.addIssue({
                code: 'custom',
                message: companyResult.error,
                path: ['companyNumber'],
            });
        }
        if (vatResult?.error) {
            context.addIssue({
                code: 'custom',
                message: vatResult.error,
                path: ['vatNumber'],
            });
        }
        if (
            companyResult?.endpoint &&
            vatResult?.endpoint &&
            companyResult.endpoint !== vatResult.endpoint
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'companyNumber and vatNumber must identify the same enterprise',
                path: ['vatNumber'],
            });
        }
        if (
            value.useGlobalProviderCredentials === false &&
            value.providerCredentials === undefined
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'providerCredentials are required when global credentials are disabled',
                path: ['providerCredentials'],
            });
        }
    });
