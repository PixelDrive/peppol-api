import Redis from 'ioredis';
import { getConfig } from '../config';

/**
 * Creates an explicit Redis connection for BullMQ. BullMQ workers require
 * maxRetriesPerRequest=null so blocking commands can wait indefinitely.
 */
export function createRedisConnection(
    connectionName: string,
    mode: 'producer' | 'worker' = 'producer'
): Redis {
    return new Redis(getConfig().REDIS_URL, {
        connectionName,
        maxRetriesPerRequest: mode === 'worker' ? null : 1,
    });
}
