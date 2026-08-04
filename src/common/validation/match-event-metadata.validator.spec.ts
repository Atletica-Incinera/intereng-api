import { BadRequestException } from '@nestjs/common';
import { IsString } from 'class-validator';
import { MatchEventMetadataValidator } from './match-event-metadata.validator';

describe('MatchEventMetadataValidator', () => {
  describe('Dynamic registration (OCP)', () => {
    class CustomTestDto {
      @IsString()
      customProp: string;
    }

    it('should dynamically register, validate, and unregister new custom DTO mappings', () => {
      // First, try validating an unmapped combination (should pass through with standard object check)
      const payload = { customProp: 123 };
      const validPayload = { customProp: 'hello' };

      // Unmapped combo passes without field constraint validation (so number passes)
      expect(MatchEventMetadataValidator.validate('custom-sport', 'CUSTOM_EVENT', payload)).toEqual(
        payload,
      );

      // Register the CustomTestDto
      MatchEventMetadataValidator.register('custom-sport', 'CUSTOM_EVENT', CustomTestDto);

      // Validation should now enforce constraints (customProp must be string, so 123 fails)
      expect(() => {
        MatchEventMetadataValidator.validate('custom-sport', 'CUSTOM_EVENT', payload);
      }).toThrow(BadRequestException);

      // String should pass validation
      expect(
        MatchEventMetadataValidator.validate('custom-sport', 'CUSTOM_EVENT', validPayload),
      ).toEqual(validPayload);

      // Unregister the CustomTestDto
      MatchEventMetadataValidator.unregister('custom-sport', 'CUSTOM_EVENT');

      // Should now pass through again without constraint validation
      expect(MatchEventMetadataValidator.validate('custom-sport', 'CUSTOM_EVENT', payload)).toEqual(
        payload,
      );
    });
  });

  describe('Futsal/Handebol GOAL/YELLOW_CARD/RED_CARD', () => {
    it('should validate successfully when minute is provided', () => {
      const validMetadata = { minute: 15 };
      const result = MatchEventMetadataValidator.validate('futsal', 'GOAL', validMetadata);
      expect(result).toEqual(validMetadata);
    });

    it('should reject when minute is missing', () => {
      expect(() => {
        MatchEventMetadataValidator.validate('futsal', 'GOAL', {});
      }).toThrow(BadRequestException);
    });

    it('should reject when minute is negative', () => {
      expect(() => {
        MatchEventMetadataValidator.validate('futsal', 'GOAL', { minute: -1 });
      }).toThrow(BadRequestException);
    });

    it('should reject when minute is not an integer', () => {
      expect(() => {
        MatchEventMetadataValidator.validate('futsal', 'GOAL', { minute: 12.5 });
      }).toThrow(BadRequestException);
    });
  });

  describe('Vôlei SET_WON', () => {
    it('should validate successfully when all 3 fields are correct', () => {
      const validMetadata = { setNumber: 1, pointsHome: 25, pointsAway: 23 };
      const result = MatchEventMetadataValidator.validate('volei', 'SET_WON', validMetadata);
      expect(result).toEqual(validMetadata);
    });

    it('should reject when setNumber, pointsHome, or pointsAway are missing', () => {
      expect(() => {
        MatchEventMetadataValidator.validate('volei', 'SET_WON', {
          pointsHome: 25,
          pointsAway: 23,
        });
      }).toThrow(BadRequestException);

      expect(() => {
        MatchEventMetadataValidator.validate('volei', 'SET_WON', { setNumber: 1, pointsAway: 23 });
      }).toThrow(BadRequestException);

      expect(() => {
        MatchEventMetadataValidator.validate('volei', 'SET_WON', { setNumber: 1, pointsHome: 25 });
      }).toThrow(BadRequestException);
    });

    it('should reject when values are negative or invalid', () => {
      expect(() => {
        MatchEventMetadataValidator.validate('volei', 'SET_WON', {
          setNumber: 0,
          pointsHome: 25,
          pointsAway: 23,
        });
      }).toThrow(BadRequestException);

      expect(() => {
        MatchEventMetadataValidator.validate('volei', 'SET_WON', {
          setNumber: 1,
          pointsHome: -5,
          pointsAway: 23,
        });
      }).toThrow(BadRequestException);
    });
  });

  describe('Basquete POINT', () => {
    it('should validate successfully when points is 1, 2, or 3 and quarter is provided', () => {
      const result = MatchEventMetadataValidator.validate('basquete', 'POINT', {
        points: 2,
        quarter: 1,
      });
      expect(result).toEqual({ points: 2, quarter: 1 });
    });

    it('should reject when points is not 1, 2, or 3', () => {
      expect(() => {
        MatchEventMetadataValidator.validate('basquete', 'POINT', { points: 4, quarter: 1 });
      }).toThrow(BadRequestException);
    });
  });

  describe('Natação OTHER', () => {
    it('should validate successfully when timeSeconds and lane are correct', () => {
      const result = MatchEventMetadataValidator.validate('natacao', 'OTHER', {
        timeSeconds: 45.67,
        lane: 4,
      });
      expect(result).toEqual({ timeSeconds: 45.67, lane: 4 });
    });

    it('should reject invalid values', () => {
      expect(() => {
        MatchEventMetadataValidator.validate('natacao', 'OTHER', { timeSeconds: -5, lane: 4 });
      }).toThrow(BadRequestException);

      expect(() => {
        MatchEventMetadataValidator.validate('natacao', 'OTHER', { timeSeconds: 45.67, lane: 0 });
      }).toThrow(BadRequestException);
    });
  });

  describe('Xadrez CHECKMATE/WALKOVER_DECLARED', () => {
    it('should validate successfully when movesCount is missing (optional)', () => {
      const result = MatchEventMetadataValidator.validate('xadrez', 'CHECKMATE', {});
      expect(result).toEqual({});
    });

    it('should validate successfully when movesCount is provided', () => {
      const result = MatchEventMetadataValidator.validate('xadrez', 'CHECKMATE', {
        movesCount: 42,
      });
      expect(result).toEqual({ movesCount: 42 });
    });
  });

  describe('Unmapped combinations', () => {
    it('should pass through when metadata is null or undefined', () => {
      expect(MatchEventMetadataValidator.validate('futsal', 'OTHER', null)).toBeNull();
      expect(MatchEventMetadataValidator.validate('futsal', 'OTHER', undefined)).toBeUndefined();
    });

    it('should pass through when metadata is a valid object', () => {
      const result = MatchEventMetadataValidator.validate('futsal', 'OTHER', {
        customField: 'value',
      });
      expect(result).toEqual({ customField: 'value' });
    });

    it('should reject when metadata is not a JSON object', () => {
      expect(() => {
        MatchEventMetadataValidator.validate('futsal', 'OTHER', 'not-an-object');
      }).toThrow(BadRequestException);

      expect(() => {
        MatchEventMetadataValidator.validate('futsal', 'OTHER', [1, 2, 3]);
      }).toThrow(BadRequestException);
    });
  });
});
