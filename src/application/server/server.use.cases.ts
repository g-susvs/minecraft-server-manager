import type { IServerProvider } from '../../domain/repositories/server.provider.interface';
import type {
  ICreateServerInput,
  IServer,
  TServerStatus,
} from '../../domain/entities/server.entity';
import { environment } from '../../infraestructure/config/environment';
import { AppError } from '../../libs/app.error';
import type { IAppContext } from '../../domain/repositories/app-context.interface';
import { renderUserData } from './templates/user-data.template';

export class ServerUseCases {
  constructor(private readonly appContext: IAppContext) {}

  /**
   * Crea un servidor nuevo.
   *
   * NOTA (persistencia): aquí NO se escribe en la tabla `servers`. Este caso de
   * uso solo aprovisiona. La escritura en base de datos la debe orquestar un
   * servicio de aplicación que combine este caso de uso con el repositorio de
   * Prisma, de modo que el caso de uso siga teniendo una sola responsabilidad.
   */
  async createServer(input: ICreateServerInput): Promise<IServer> {
    const userData = this.generateUserDataScript(input);
    return this.appContext.providers.serverProvider.create(
      input.name,
      userData,
    );
  }

  async startServer(instanceId: string): Promise<TServerStatus> {
    return this.appContext.providers.serverProvider.start(instanceId);
  }

  async stopServer(instanceId: string): Promise<TServerStatus> {
    return this.appContext.providers.serverProvider.stop(instanceId);
  }

  /**
   * Obtiene el estado y la IP pública de un servidor.
   *
   * NOTA (persistencia): el servicio de aplicación que llame a este método es
   * el que debe refrescar `status` y `publicIp` en la tabla `servers` durante
   * el polling descrito en la sección 11 del plan.
   */
  async getServerStatus(instanceId: string): Promise<IServer> {
    const server =
      await this.appContext.providers.serverProvider.findById(instanceId);

    if (!server) {
      throw AppError.notFound(`Server not found: ${instanceId}`);
    }

    return server;
  }

  /**
   * Lista únicamente los servidores administrados por la aplicación.
   *
   * NOTA (persistencia): según la sección 4 del plan la tabla `servers` es la
   * fuente de verdad. Cuando exista, el servicio de aplicación debería leer de
   * la base de datos y usar este método solo para reconciliar el estado real
   * contra AWS.
   */
  async listServers(): Promise<IServer[]> {
    return this.appContext.providers.serverProvider.findAllManaged();
  }

  /**
   * Genera el script de User Data que instala y arranca Minecraft Bedrock.
   *
   * El script vive en `templates/user-data.template.ts`. `name` se interpola
   * dentro de un script que corre como root en la instancia, por eso el esquema
   * de validación restringe el campo a caracteres seguros antes de llegar hasta
   * aquí. `difficulty` es seguro por construcción: solo puede ser uno de los
   * literales de `SERVER_DIFFICULTIES`. Las opciones booleanas nunca llegan como
   * texto libre.
   */
  private generateUserDataScript({
    name,
    difficulty,
    showCoordinates,
    bonusChest,
    startingMap,
  }: ICreateServerInput) {
    const script = renderUserData({
      bedrockUrl: environment.minecraft.bedrockServerUrl,
      serverName: name,
      difficulty,
      showCoordinates,
      bonusChest,
      startingMap,
    });
    return Buffer.from(script).toString('base64');
  }
}
