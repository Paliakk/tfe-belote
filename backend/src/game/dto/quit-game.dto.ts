import { IsInt, Min } from "class-validator";

export class QuitGameDto {
    @IsInt()
    @Min(1)
    joueurId: number
}