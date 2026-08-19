import { IsBase64, IsIn, IsInt, Max, Min } from 'class-validator';

export const TEAM_LOGO_CONTENT_TYPE = 'image/webp' as const;
export const TEAM_LOGO_HARD_MAX_BYTES = 8 * 1024 * 1024;

export class CreateTeamLogoUploadUrlDto {
  @IsIn([TEAM_LOGO_CONTENT_TYPE])
  contentType!: typeof TEAM_LOGO_CONTENT_TYPE;

  @IsInt()
  @Min(1)
  @Max(TEAM_LOGO_HARD_MAX_BYTES)
  sizeBytes!: number;

  @IsBase64()
  checksumSha256!: string;
}
