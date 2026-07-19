import type {
  IAppContext,
  IProviders,
} from '../../domain/repositories/app-context.interface';
import { EC2Provider } from '../aws/ec2.priveder';

export class AppContext implements IAppContext {
  providers: IProviders;

  constructor() {
    this.providers = {
      serverProvider: new EC2Provider(),
    };
  }
}
