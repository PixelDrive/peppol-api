import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { beforeAll, describe, expect, it, vi } from 'vitest';

type OpenApiOperation = {
    responses?: Record<
        string,
        {
            content?: Record<string, { schema?: unknown }>;
        }
    >;
};

type OpenApiSchema = {
    properties?: Record<string, OpenApiSchema>;
    items?: OpenApiSchema;
};

const operationMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

function findMissingSuccessSchemas(paths: Record<string, unknown>): string[] {
    return Object.entries(paths).flatMap(([path, pathItem]) =>
        operationMethods.flatMap((method) => {
            const operation = (
                pathItem as Record<string, OpenApiOperation | undefined>
            )?.[method];
            if (!operation) {
                return [];
            }

            const successfulResponses = Object.entries(
                operation.responses ?? {}
            ).filter(([status]) => /^2\d\d$/.test(status));
            if (successfulResponses.length === 0) {
                return [`${method.toUpperCase()} ${path}`];
            }

            return successfulResponses
                .filter(
                    ([, response]) =>
                        !response.content?.['application/json']?.schema
                )
                .map(
                    ([status]) => `${method.toUpperCase()} ${path} (${status})`
                );
        })
    );
}

async function generateSpecification() {
    const { router } = await import('../src/routers');
    return new OpenAPIGenerator({
        schemaConverters: [new ZodToJsonSchemaConverter()],
    }).generate(router, {
        info: {
            title: 'OpenAPI output schema test',
            version: '0.1.0',
        },
    });
}

describe('OpenAPI output schemas', () => {
    beforeAll(() => {
        vi.stubEnv('NODE_ENV', 'test');
        vi.stubEnv('ENCRYPTION_SECRET', '0'.repeat(64));
    });

    it('documents a JSON schema for every successful operation response', async () => {
        const specification = await generateSpecification();
        const missingSchemas = findMissingSuccessSchemas(
            specification.paths ?? {}
        );

        expect(missingSchemas).toEqual([]);
    });

    it('does not expose API key hashes in the list response schema', async () => {
        const specification = await generateSpecification();
        const operation = specification.paths?.[
            '/admin/enterprises/{enterpriseId}/api-keys'
        ]?.get as OpenApiOperation | undefined;
        const responseSchema = operation?.responses?.['200']?.content?.[
            'application/json'
        ]?.schema as OpenApiSchema | undefined;
        const apiKeyProperties =
            responseSchema?.properties?.apiKeys?.items?.properties;

        expect(apiKeyProperties?.prefix).toBeDefined();
        expect(apiKeyProperties).not.toHaveProperty('keyHash');
        expect(apiKeyProperties).not.toHaveProperty('apiKey');
    });
});
