import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EditionStaffRoleType } from '@prisma/client';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { env } from '../common/config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateTeamLogoUploadUrlDto,
  TEAM_LOGO_CONTENT_TYPE,
  TEAM_LOGO_HARD_MAX_BYTES,
} from './dto/create-team-logo-upload-url.dto';
import { TeamLogoUploadUrlResponseDto } from './dto/team-logo-upload-url-response.dto';

type S3Credentials = { accessKeyId: string; secretAccessKey: string };

@Injectable()
export class UploadsService {
  private readonly bucket = env.s3Bucket;
  private readonly maxLogoBytes = Math.min(env.s3MaxLogoBytes, TEAM_LOGO_HARD_MAX_BYTES);
  private readonly internalClient: S3Client;
  private readonly presignClient: S3Client;

  constructor(private readonly prisma: PrismaService) {
    const credentials = this.credentials();
    const shared = {
      region: env.s3Region,
      forcePathStyle: env.s3ForcePathStyle,
      ...(credentials ? { credentials } : {}),
    };
    this.internalClient = new S3Client({
      ...shared,
      ...(env.s3Endpoint ? { endpoint: env.s3Endpoint } : {}),
    });
    this.presignClient = new S3Client({
      ...shared,
      ...(env.s3PresignEndpoint ? { endpoint: env.s3PresignEndpoint } : {}),
    });
  }

  async createTeamLogoUploadUrl(
    teamId: string,
    dto: CreateTeamLogoUploadUrlDto,
    user: AuthenticatedUser,
  ): Promise<TeamLogoUploadUrlResponseDto> {
    await this.assertCanManageTeam(teamId, user);
    if (dto.sizeBytes > this.maxLogoBytes) {
      throw new BadRequestException(
        `O logotipo deve ter no máximo ${this.maxLogoBytes} bytes após a conversão.`,
      );
    }
    if (!this.isSha256Base64(dto.checksumSha256)) {
      throw new BadRequestException('O checksum SHA-256 do logotipo é inválido.');
    }

    const fileKey = `${this.teamLogoPrefix(teamId)}${randomUUID()}.webp`;
    const expiresIn = env.s3PresignTtlSeconds;
    try {
      const post = await createPresignedPost(this.presignClient, {
        Bucket: this.bucket,
        Key: fileKey,
        Expires: expiresIn,
        Fields: {
          'Content-Type': TEAM_LOGO_CONTENT_TYPE,
          'x-amz-checksum-algorithm': 'SHA256',
          'x-amz-checksum-sha256': dto.checksumSha256,
        },
        Conditions: [['content-length-range', dto.sizeBytes, dto.sizeBytes]],
      });
      return {
        fileKey,
        uploadUrl: post.url,
        method: 'POST',
        fields: post.fields,
        expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
        maxSizeBytes: this.maxLogoBytes,
      };
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error && error.name === 'CredentialsProviderError'
          ? 'O armazenamento de arquivos não está configurado.'
          : 'Não foi possível preparar o envio do logotipo.',
      );
    }
  }

  async assertValidTeamLogo(teamId: string, fileKey: string): Promise<void> {
    if (!fileKey.startsWith(this.teamLogoPrefix(teamId)) || !fileKey.endsWith('.webp')) {
      throw new BadRequestException('A chave do logotipo não pertence à equipe informada.');
    }
    const objectId = fileKey.slice(this.teamLogoPrefix(teamId).length, -'.webp'.length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(objectId)) {
      throw new BadRequestException('A chave do logotipo é inválida.');
    }

    try {
      const metadata = await this.internalClient.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: fileKey }),
      );
      if (
        metadata.ContentLength === undefined ||
        metadata.ContentLength < 1 ||
        metadata.ContentLength > this.maxLogoBytes
      ) {
        await this.rejectInvalidStoredLogo(fileKey, 'O tamanho armazenado do logotipo é inválido.');
      }
      if (metadata.ContentType !== TEAM_LOGO_CONTENT_TYPE) {
        await this.rejectInvalidStoredLogo(
          fileKey,
          'O arquivo armazenado não é uma imagem WebP válida.',
        );
      }

      const object = await this.internalClient.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: fileKey, Range: 'bytes=0-11' }),
      );
      const body = object.Body;
      if (!body) {
        return this.rejectInvalidStoredLogo(
          fileKey,
          'Não foi possível validar o conteúdo do logotipo.',
        );
      }
      const header = await body.transformToByteArray();
      if (!this.isWebpHeader(header)) {
        await this.rejectInvalidStoredLogo(
          fileKey,
          'O conteúdo enviado não corresponde a uma imagem WebP.',
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException('O logotipo enviado não foi encontrado no armazenamento.');
    }
  }

  publicUrl(fileKey: string): string {
    const normalizedKey = fileKey.replace(/^\/+/, '');
    const encodedKey = normalizedKey.split('/').map(encodeURIComponent).join('/');
    if (!this.isManagedTeamLogoKey(normalizedKey)) return `/${encodedKey}`;
    return `${env.s3PublicBaseUrl}/${encodedKey}`;
  }

  private async assertCanManageTeam(teamId: string, user: AuthenticatedUser): Promise<void> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, editionLinks: { select: { editionId: true } } },
    });
    if (!team) throw new NotFoundException('Equipe não encontrada.');
    if (user.isSuperAdmin) return;

    const editionIds = team.editionLinks.map((link) => link.editionId);
    if (!editionIds.length) {
      throw new ForbiddenException('A equipe não pertence a uma edição gerenciável.');
    }
    const role = await this.prisma.editionStaffRole.findFirst({
      where: {
        staffId: user.id,
        editionId: { in: editionIds },
        role: EditionStaffRoleType.EDITION_ADMIN,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!role) {
      throw new ForbiddenException('Você não pode alterar o logotipo desta equipe.');
    }
  }

  private teamLogoPrefix(teamId: string): string {
    return `teams/${encodeURIComponent(teamId)}/logos/`;
  }

  private isManagedTeamLogoKey(fileKey: string): boolean {
    return /^teams\/[^/]+\/logos\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i.test(
      fileKey,
    );
  }

  private credentials(): S3Credentials | undefined {
    const accessKeyId = env.s3AccessKeyId;
    const secretAccessKey = env.s3SecretAccessKey;
    if (!accessKeyId && !secretAccessKey) return undefined;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY devem ser informadas em conjunto.');
    }
    return { accessKeyId, secretAccessKey };
  }

  private isSha256Base64(value: string): boolean {
    try {
      return value.length === 44 && Buffer.from(value, 'base64').length === 32;
    } catch {
      return false;
    }
  }

  private isWebpHeader(bytes: Uint8Array): boolean {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    );
  }

  private async rejectInvalidStoredLogo(fileKey: string, message: string): Promise<never> {
    try {
      await this.internalClient.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: fileKey }),
      );
    } catch {
      // A falha de limpeza não deve esconder o motivo da rejeição do arquivo.
    }
    throw new BadRequestException(message);
  }
}
