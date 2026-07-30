import { z } from 'zod';

const countryCodeSchema = z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/i, 'Must be an ISO 3166-1 alpha-2 country code')
    .transform((value) => value.toUpperCase());

const optionalText = z.string().trim().min(1).max(500).optional();

export const participantRegistrationInputSchema = z.object({
    enterpriseId: z.uuid(),
    participantIdentifierId: z.uuid(),
    countryCode: countryCodeSchema,
    businessCard: z
        .object({
            name: z.string().trim().min(1).max(200).optional(),
            language: z
                .string()
                .trim()
                .regex(/^[A-Z]{2}$/i, 'Must be an ISO 639 two-letter code')
                .transform((value) => value.toLowerCase())
                .optional(),
            geographicalInformation: optionalText,
            websiteUrls: z.array(z.url()).max(20).optional(),
            contacts: z
                .array(
                    z.object({
                        type: optionalText,
                        name: optionalText,
                        phoneNumber: optionalText,
                        email: z.email().optional(),
                    })
                )
                .max(20)
                .optional(),
            additionalInformation: z
                .string()
                .trim()
                .min(1)
                .max(2000)
                .optional(),
            registrationDate: z.iso.date().optional(),
        })
        .default({}),
    publishToDirectory: z.boolean().default(true),
});

export const participantRegistrationPathSchema = z.object({
    enterpriseId: z.uuid(),
    participantIdentifierId: z.uuid(),
});

export const participantServiceInputSchema =
    participantRegistrationPathSchema.extend({
        documentTypeIdentifier: z.string().trim().min(1).max(1000),
        documentTypeScheme: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .default('busdox-docid-qns'),
        processIdentifier: z.string().trim().min(1).max(1000),
        processScheme: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .default('cenbii-procid-ubl'),
    });

export const participantServiceRemovalInputSchema =
    participantRegistrationPathSchema.extend({
        documentTypeIdentifier: z.string().trim().min(1).max(1000),
        documentTypeScheme: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .default('busdox-docid-qns'),
    });
