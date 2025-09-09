import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class StartGameDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  scoreMax?: number; //Optionnel, par défaut = 301
}
