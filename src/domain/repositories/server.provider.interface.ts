import type { IServer, TServerStatus } from '../entities/server.entity';

export interface IServerProvider {
  create(name: string, userData: string): Promise<IServer>;

  start(instanceId: string): Promise<TServerStatus>;

  stop(instanceId: string): Promise<TServerStatus>;

  findById(instanceId: string): Promise<IServer | null>;

  findAllManaged(): Promise<IServer[]>;
}
