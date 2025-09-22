import { IsOptional, IsString, Length } from 'class-validator';

/**
 * DTO (Data Transfer Object) utilisé pour valider les données reçues
 * lors de la création d'un lobby.
 */
export class CreateLobbyDto {
  @IsString({ message: 'Le nom du lobby doit être une chaîne de caractères.' })
  @Length(3, 50, { message: 'Le nom doit faire entre 3 et 50 caractères.' })
  nom: string;

  @IsOptional()
  @IsString({ message: 'Le mot de passe doit être une chaîne si fourni.' })
  password?: string;

  visibility?: 'public' | 'friends' | 'private'
}
