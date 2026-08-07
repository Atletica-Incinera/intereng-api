import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class GetCatalogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString({ message: 'O termo de busca deve ser uma string.' })
  search?: string;
}
