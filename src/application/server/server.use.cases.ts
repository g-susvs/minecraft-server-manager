import type { IServerProvider } from '../../domain/repositories/server.provider.interface';
import type {
  ICreateServerInput,
  IServer,
  TServerStatus,
} from '../../domain/entities/server.entity';
import { environment } from '../../infraestructure/config/environment';
import type { IAppContext } from '../../domain/repositories/app-context.interface';

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
      throw new Error(`Server not found: ${instanceId}`);
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
   * `name` se interpola dentro de un script que corre como root en la
   * instancia, por eso el esquema de validación restringe el campo a
   * caracteres seguros antes de llegar hasta aquí. `difficulty` es seguro por
   * construcción: solo puede ser uno de los literales de `SERVER_DIFFICULTIES`.
   */
  private generateUserDataScript({ name, difficulty }: ICreateServerInput) {
    const script = `#!/bin/bash
# Update OS and install dependencies
apt-get update -y
apt-get install -y wget unzip screen curl

# Create minecraft user
useradd -r -m -U -d /opt/minecraft -s /bin/bash minecraft

# Download Bedrock server
# We use a reliable default version url
BEDROCK_URL="${environment.minecraft.bedrockServerUrl}"

su - minecraft -c "wget -q $BEDROCK_URL -O bedrock-server.zip"
su - minecraft -c "unzip -q bedrock-server.zip -d server"
su - minecraft -c "rm bedrock-server.zip"

# Configure server.properties
# IMPORTANTE: el paquete de Bedrock trae 'allow-list=true' con un allowlist.json
# vacio, lo que hace que el servidor rechace a TODOS los jugadores con el error
# "No estas invitado a jugar en este servidor". Hay que desactivarlo aqui porque
# el servicio systemd corre sin consola interactiva: no hay forma de ejecutar el
# comando 'allowlist off' despues de arrancar.
PROPS=/opt/minecraft/server/server.properties
sed -i "s/^allow-list=.*/allow-list=false/" $PROPS
sed -i "s/^server-name=.*/server-name=${name}/" $PROPS
sed -i "s/^difficulty=.*/difficulty=${difficulty}/" $PROPS

# Create systemd service
cat << 'EOF' > /etc/systemd/system/minecraft.service
[Unit]
Description=Minecraft Bedrock Server
After=network.target

[Service]
Type=simple
User=minecraft
WorkingDirectory=/opt/minecraft/server
ExecStart=/opt/minecraft/server/bedrock_server
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
systemctl enable minecraft
systemctl start minecraft
`;
    return Buffer.from(script).toString('base64');
  }
}
