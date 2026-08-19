export class TeamLogoUploadUrlResponseDto {
  fileKey!: string;
  uploadUrl!: string;
  method!: 'POST';
  fields!: Record<string, string>;
  expiresAt!: string;
  maxSizeBytes!: number;
}
