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
   * `showCoordinates` es un booleano, nunca llega como texto libre.
   */
  private generateUserDataScript({
    name,
    difficulty,
    showCoordinates,
    bonusChest,
    startingMap,
  }: ICreateServerInput) {
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
#
# El servidor corre DENTRO de screen en vez de ejecutarse directo. Es lo que da
# acceso a la consola de Bedrock: sin ella no se pueden enviar comandos como
# 'gamerule', 'allowlist add' o 'stop', porque el proceso no tendria stdin.
#
# Efecto colateral a tener presente: los logs de Bedrock ya NO salen en
# 'journalctl -u minecraft' (screen se queda con la salida), por eso se activa
# el log propio de screen en /opt/minecraft/console.log.
#
# ExecStop envia el comando 'stop' de Bedrock, que guarda el mundo y cierra
# ordenadamente, en vez del SIGTERM en seco que puede corromper el mundo si
# justo estaba escribiendo en disco.
cat << 'EOF' > /etc/systemd/system/minecraft.service
[Unit]
Description=Minecraft Bedrock Server
After=network.target

[Service]
Type=simple
User=minecraft
WorkingDirectory=/opt/minecraft/server
Environment=LD_LIBRARY_PATH=/opt/minecraft/server
ExecStart=/usr/bin/screen -L -Logfile /opt/minecraft/console.log -DmS minecraft /opt/minecraft/server/bedrock_server
ExecStop=/usr/bin/screen -S minecraft -p 0 -X stuff "stop\\015"
TimeoutStopSec=90
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
systemctl enable minecraft
systemctl start minecraft

# Espera a que el mundo este cargado y aceptando comandos.
# El log se rota antes de cada arranque, asi que "Server started." siempre
# corresponde al arranque en curso y nunca a uno anterior.
wait_for_server() {
  for _ in $(seq 1 90); do
    if grep -q "Server started." /opt/minecraft/console.log 2>/dev/null; then
      sleep 3
      return 0
    fi
    sleep 2
  done
  return 1
}

wait_for_server

# Apply world creation options
#
# El cofre de regalo y el mapa inicial NO son propiedades del servidor ni
# comandos de consola: son opciones de creacion de mundo que viven en el
# level.dat. Se parchean tres flags NBT:
#
#   bonusChestEnabled=1 + bonusChestSpawned=0  -> coloca el cofre junto al spawn
#   startWithMapEnabled=1                      -> los jugadores nacen con mapa
#
# Poner bonusChestSpawned=0 es lo que hace que el cofre aparezca aunque el
# mundo ya este generado, asi no hace falta pre-generar un mundo aparte.
#
# El level.dat de Bedrock es NBT little-endian SIN comprimir, con una cabecera
# de 8 bytes que incluye la longitud del archivo. Por eso el parche sobreescribe
# bytes en el sitio y nunca cambia el tamano: si cambiara, la cabecera quedaria
# invalida y el mundo no cargaria.
PATCH_LEVEL_DAT=${bonusChest || startingMap ? 'true' : 'false'}

if [ "$PATCH_LEVEL_DAT" = "true" ]; then
cat << 'PYEOF' > /opt/minecraft/patch-level-dat.py
import os
import struct
import sys

bonus_chest = sys.argv[1] == '1'
starting_map = sys.argv[2] == '1'

level_name = 'Bedrock level'
with open('/opt/minecraft/server/server.properties') as props:
    for line in props:
        if line.startswith('level-name='):
            level_name = line.split('=', 1)[1].strip()

path = os.path.join('/opt/minecraft/server/worlds', level_name, 'level.dat')

with open(path, 'rb') as handle:
    data = bytearray(handle.read())

original_size = len(data)


def set_byte_tag(tag, value):
    # TAG_Byte: 0x01 + longitud del nombre (uint16 LE) + nombre + payload
    needle = b'\\x01' + struct.pack('<H', len(tag)) + tag.encode('ascii')
    index = data.find(needle)
    if index < 0:
        print('WARN: tag no encontrado en level.dat: ' + tag)
        return
    data[index + len(needle)] = value
    print('OK: ' + tag + ' = ' + str(value))


if bonus_chest:
    set_byte_tag('bonusChestEnabled', 1)
    set_byte_tag('bonusChestSpawned', 0)

if starting_map:
    set_byte_tag('startWithMapEnabled', 1)

if len(data) != original_size:
    sys.exit('ERROR: el parche cambio el tamano del archivo, se aborta')

with open(path, 'wb') as handle:
    handle.write(data)

print('level.dat parcheado')
PYEOF

  # El servidor tiene que estar detenido: se apaga con 'stop' (via ExecStop),
  # que guarda el mundo, y solo despues se toca el archivo.
  systemctl stop minecraft
  sleep 5

  cp "/opt/minecraft/server/worlds/$(grep '^level-name=' $PROPS | cut -d= -f2)/level.dat" /opt/minecraft/level.dat.bak 2>/dev/null

  python3 /opt/minecraft/patch-level-dat.py ${bonusChest ? '1' : '0'} ${
    startingMap ? '1' : '0'
  } >> /opt/minecraft/console.log 2>&1

  chown minecraft:minecraft /opt/minecraft/server/worlds -R

  # Se rota el log para que wait_for_server detecte este arranque y no el
  # anterior, que ya dejo su propio "Server started." en el archivo.
  mv /opt/minecraft/console.log /opt/minecraft/console-install.log 2>/dev/null
  systemctl start minecraft
  wait_for_server
fi

# Apply world gamerules
#
# 'showcoordinates' es un gamerule: no existe en server.properties y solo se
# acepta con el mundo ya cargado.
#
# Va AL FINAL a proposito. El gamerule se aplica en memoria y solo baja a disco
# cuando el servidor guarda, asi que enviarlo antes del parche de level.dat lo
# perdia en el reinicio: el cofre aparecia (esta en el archivo) pero las
# coordenadas no. Aqui ya no queda ningun reinicio por delante.
GAMERULE_SHOW_COORDINATES=${showCoordinates ? 'true' : 'false'}

for _ in 1 2 3; do
  su - minecraft -c "screen -S minecraft -p 0 -X stuff 'gamerule showcoordinates $GAMERULE_SHOW_COORDINATES\\015'"
  sleep 5
  # El servidor responde "Game rule showcoordinates has been updated to ...".
  # Si no aparece, el comando no llego a la consola y se reintenta.
  if grep -qi "gamerule showcoordinates\\|showcoordinates has been updated" /opt/minecraft/console.log 2>/dev/null; then
    break
  fi
done
`;
    return Buffer.from(script).toString('base64');
  }
}
