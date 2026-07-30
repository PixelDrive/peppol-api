import { z } from 'zod';
import {
    normalizePeppolParticipantIdentifier,
    toBelgianPeppolEndpoint,
} from '../../../lib/peppol-endpoint';

export const dokapiCredentialsSchema = z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    baseUrl: z.url(),
    tokenUrl: z.url().optional(),
});

type ParticipantNormalization =
    | { endpoint: string; error?: never }
    | { endpoint?: never; error: string };

function normalizeCompanyNumber(value: string): ParticipantNormalization {
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

function normalizeVatNumber(value: string): ParticipantNormalization {
    const compactVat = value.replaceAll(/[\s.-]/g, '').toUpperCase();
    if (compactVat.startsWith('BE')) {
        return normalizeCompanyNumber(compactVat);
    }
    return { error: 'Belgian VAT number must start with BE' };
}

function normalizeParticipantId(value: string): ParticipantNormalization {
    try {
        return {
            endpoint: normalizePeppolParticipantIdentifier(value).canonical,
        };
    } catch (error) {
        return {
            error:
                error instanceof Error
                    ? error.message
                    : 'Invalid Peppol participant identifier',
        };
    }
}

const enterpriseInputBaseSchema = z.object({
    name: z.string().trim().min(1).max(200),
    participantId: z.string().trim().min(1).optional(),
    additionalParticipantIds: z
        .array(z.string().trim().min(1))
        .max(20)
        .default([]),
    companyNumber: z.string().trim().optional(),
    vatNumber: z.string().trim().optional(),
    provider: z.literal('DOKAPI').default('DOKAPI'),
    useGlobalProviderCredentials: z.boolean().default(true),
    providerCredentials: dokapiCredentialsSchema.optional(),
});

type EnterpriseInputValue = z.infer<typeof enterpriseInputBaseSchema>;

function validateLegacyBelgianIdentity(
    value: EnterpriseInputValue,
    context: z.RefinementCtx
): string | undefined {
    if (value.participantId !== undefined) {
        return undefined;
    }
    if (value.companyNumber === undefined && value.vatNumber === undefined) {
        context.addIssue({
            code: 'custom',
            message:
                'participantId is required unless a Belgian companyNumber or vatNumber is provided',
            path: ['participantId'],
        });
        return undefined;
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
    return companyResult?.endpoint ?? vatResult?.endpoint;
}

function validateExplicitPrimaryParticipant(
    value: EnterpriseInputValue,
    context: z.RefinementCtx
): string | undefined {
    if (!value.participantId) {
        return undefined;
    }
    const result = normalizeParticipantId(value.participantId);
    if ('error' in result) {
        context.addIssue({
            code: 'custom',
            message: result.error,
            path: ['participantId'],
        });
        return undefined;
    }
    return result.endpoint;
}

function validateAdditionalParticipants(
    value: EnterpriseInputValue,
    primaryEndpoint: string | undefined,
    context: z.RefinementCtx
): void {
    const normalizedParticipantIds = new Set(
        primaryEndpoint ? [primaryEndpoint] : []
    );
    for (const [
        index,
        participantId,
    ] of value.additionalParticipantIds.entries()) {
        const result = normalizeParticipantId(participantId);
        if ('error' in result) {
            context.addIssue({
                code: 'custom',
                message: result.error,
                path: ['additionalParticipantIds', index],
            });
            continue;
        }
        if (normalizedParticipantIds.has(result.endpoint)) {
            context.addIssue({
                code: 'custom',
                message:
                    'Participant identifiers must be unique after normalization',
                path: ['additionalParticipantIds', index],
            });
            continue;
        }
        normalizedParticipantIds.add(result.endpoint);
    }
}

export const enterpriseInputSchema = enterpriseInputBaseSchema.superRefine(
    (value, context) => {
        const primaryEndpoint =
            validateExplicitPrimaryParticipant(value, context) ??
            validateLegacyBelgianIdentity(value, context);
        validateAdditionalParticipants(value, primaryEndpoint, context);

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
    }
);

export type EnterpriseInput = z.infer<typeof enterpriseInputSchema>;

/**
 * Resolves the primary and additional participant identifiers after the
 * enterprise input schema has validated their syntax and uniqueness.
 */
export function resolveEnterpriseParticipantIdentifiers(
    input: EnterpriseInput
): { scheme: string; value: string; canonical: string }[] {
    const primary = input.participantId
        ? normalizePeppolParticipantIdentifier(input.participantId)
        : toBelgianPeppolEndpoint(input.companyNumber ?? input.vatNumber!);
    return [
        primary,
        ...input.additionalParticipantIds.map((participantId) =>
            normalizePeppolParticipantIdentifier(participantId)
        ),
    ];
}
