export enum FieldType {
  NUMBER = 'number',
  JSON = 'json',
  STRING = 'string',
}

/**
 * Central configuration of field types for Redis Stream serialization and deserialization.
 * Serves as the single source of truth to avoid hardcoded strings across modules (OCP/DRY).
 */
export const STREAM_FIELDS_CONFIG: Record<string, FieldType> = {
  sequence: FieldType.NUMBER,
  revision: FieldType.NUMBER,
  scoreA: FieldType.NUMBER,
  scoreB: FieldType.NUMBER,
  metadata: FieldType.JSON,
};

export type ConverterFn = (val: string) => unknown;

/**
 * Dynamic conversion functions (Strategy Pattern) to deserialize values based on their FieldType.
 * Adding support for new serializable types only requires modifying this mapping and FieldType enum.
 */
export const FIELD_CONVERTERS: Record<FieldType, ConverterFn> = {
  [FieldType.NUMBER]: (val: string) => Number(val),
  [FieldType.JSON]: (val: string) => {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  },
  [FieldType.STRING]: (val: string) => val,
};

/**
 * Utility class to serialize objects into flat string arrays for Redis Streams,
 * and deserialize them back with correct type conversions.
 * Centralizes field configuration to adhere to DRY and OCP.
 */
export class RedisStreamSerializer {
  /**
   * Serializes a flat key-value object into a flat array of strings.
   * Dynamically formats values based on their runtime types.
   */
  static serialize(data: Record<string, unknown>): string[] {
    const fields: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) {
        fields.push(key, '');
        continue;
      }

      const serialized =
        typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
            ? String(value)
            : JSON.stringify(value);
      fields.push(key, serialized ?? '');
    }
    return fields;
  }

  /**
   * Deserializes a flat array of alternating keys and values from a Redis stream
   * back into a typed object, converting fields based on the centralized configuration.
   */
  static deserialize(fields: string[]): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const val = fields[i + 1];

      const fieldType = STREAM_FIELDS_CONFIG[key] ?? FieldType.STRING;
      const converter = FIELD_CONVERTERS[fieldType] ?? FIELD_CONVERTERS[FieldType.STRING];
      data[key] = converter(val);
    }
    return data;
  }
}
