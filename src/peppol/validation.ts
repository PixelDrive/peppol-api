import {
    KositValidator,
    type KositValidationResult,
} from '@pixeldrive/peppol-toolkit';
import { getConfig } from '../config';

let validator: KositValidator | undefined;

/**
 * Validates a UBL document with an independent KoSIT-compatible service.
 */
export async function validateWithKosit(
    xml: string
): Promise<KositValidationResult> {
    validator ??= new KositValidator({
        endpoint: getConfig().KOSIT_VALIDATOR_URL,
    });
    return await validator.validate(xml);
}
