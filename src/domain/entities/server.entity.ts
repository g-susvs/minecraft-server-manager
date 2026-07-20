export type TServerStatus =
  | 'pending'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'shutting-down'
  | 'terminated'
  | 'unknown';

/**
 * Valores admitidos por `difficulty` en el server.properties de Bedrock.
 * Es la única fuente de verdad: el esquema de validación deriva de aquí.
 */
export const SERVER_DIFFICULTIES = [
  'peaceful',
  'easy',
  'normal',
  'hard',
] as const;

export type TServerDifficulty = (typeof SERVER_DIFFICULTIES)[number];

export const DEFAULT_SERVER_DIFFICULTY: TServerDifficulty = 'normal';

export interface IServer {
  instanceId: string;
  name: string;
  status: TServerStatus;
  publicIp: string | null;
}

export interface ICreateServerInput {
  name: string;
  difficulty: TServerDifficulty;
  showCoordinates: boolean;
  bonusChest: boolean;
  startingMap: boolean;
}
