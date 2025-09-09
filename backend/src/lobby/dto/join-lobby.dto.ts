import { IsInt, Min, IsOptional, IsString } from 'class-validator';
/**
 * DTO pour rejoindre un lobby.
 * TEMPORAIRE --> On transmet joueurId tant que je n'ai pas intégrer Auth0
 */

export class JoinLobbyDto {
  @IsInt({ message: 'lobbyId doit être un entier.' })
  @Min(1)
  lobbyId: number;

  @IsOptional()
  @IsString({ message: 'password doit être une chaîne si fourni.' })
  password?: string;
}
