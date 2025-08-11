import { IsIn, IsInt, IsOptional, Min } from "class-validator"


export class StartGameDto {
    @IsInt()
    @Min(1)
    joueurId: number //Temporaire, sera remplacé par l'id Auth0

    @IsOptional()
    @IsInt()
    @Min(1)
    scoreMax?: number //Optionnel, par défaut = 301
}