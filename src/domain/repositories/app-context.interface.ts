import type { IServerProvider } from './server.provider.interface';

export interface IAppContext {
  providers: IProviders;
}

export interface IProviders {
  serverProvider: IServerProvider;
}
