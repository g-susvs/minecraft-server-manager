export type TServerStatus =
  | 'pending'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'shutting-down'
  | 'terminated'
  | 'unknown';

export interface IServer {
  instanceId: string;
  name: string;
  status: TServerStatus;
  publicIp: string | null;
}
