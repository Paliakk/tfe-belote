import { IsInt, Min } from 'class-validator'

export class LeaveLobbyDto {
    @IsInt()
    @Min(1)
    joueurId: number
}