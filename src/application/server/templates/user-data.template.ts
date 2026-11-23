/**
 * Script de User Data que instala y configura un servidor Minecraft Bedrock.
 *
 * Se escribe con `String.raw`, así el bash se lee tal cual, sin escapar
 * barras invertidas. Los valores que cambian por servidor son marcadores
 * `__NOMBRE__` que `renderUserData` reemplaza antes de codificar el script en
 * base64. Ver `docs/WORLD_CONFIG.md` para el porqué de cada paso.
 */

export interface IUserDataValues {
  bedrockUrl: string;
  serverName: string;
  difficulty: string;
  showCoordinates: boolean;
  bonusChest: boolean;
  startingMap: boolean;
}

const USER_DATA_TEMPLATE = String.raw`#!/bin/bash
# Update OS and install dependencies
apt-get update -y
apt-get install -y wget unzip screen curl

# Create minecraft user
useradd -r -m -U -d /opt/minecraft -s /bin/bash minecraft

# Download Bedrock server
# We use a reliable default version url
BEDROCK_URL="__BEDROCK_URL__"

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
sed -i "s/^server-name=.*/server-name=__SERVER_NAME__/" $PROPS
sed -i "s/^difficulty=.*/difficulty=__DIFFICULTY__/" $PROPS

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
ExecStartPre=/opt/minecraft/update-public-ip.sh
ExecStart=/usr/bin/screen -L -Logfile /opt/minecraft/console.log -DmS minecraft /opt/minecraft/server/bedrock_server
ExecStop=/usr/bin/screen -S minecraft -p 0 -X stuff "stop\015"
TimeoutStopSec=90
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Script que actualiza la IP publica en server-udp-ports antes de cada arranque.
#
# AWS asigna una IP publica nueva cada vez que la instancia se detiene y vuelve a
# encender. El servidor anuncia server-udp-ports a los clientes, asi que si la IP
# cambia y nadie la actualiza, los jugadores no pueden conectar. Este script lee
# la IP actual desde los metadatos de la instancia (IMDSv2) y la escribe antes de
# que arranque Bedrock. Se ejecuta como ExecStartPre del servicio.
cat << 'IPSCRIPT' > /opt/minecraft/update-public-ip.sh
#!/bin/bash
PROPS=/opt/minecraft/server/server.properties
TOKEN=$(curl -s -m 5 -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
IP=""
for _ in 1 2 3 4 5; do
  IP=$(curl -s -m 5 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
  [ -n "$IP" ] && break
  sleep 2
done
if [ -z "$IP" ]; then
  echo "update-public-ip: no se pudo obtener la IP publica" >&2
  exit 0
fi
sed -i "s|^server-udp-ports=.*|server-udp-ports=$IP:19400-19500:19400-19500|" "$PROPS"
IPSCRIPT
chmod 755 /opt/minecraft/update-public-ip.sh

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
PATCH_LEVEL_DAT=__PATCH_LEVEL_DAT__

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
    needle = b'\x01' + struct.pack('<H', len(tag)) + tag.encode('ascii')
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

  python3 /opt/minecraft/patch-level-dat.py __BONUS_CHEST__ __STARTING_MAP__ >> /opt/minecraft/console.log 2>&1

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
GAMERULE_SHOW_COORDINATES=__GAMERULE_SHOW_COORDINATES__

for _ in 1 2 3; do
  su - minecraft -c "screen -S minecraft -p 0 -X stuff 'gamerule showcoordinates $GAMERULE_SHOW_COORDINATES\015'"
  sleep 5
  # El servidor responde "Game rule showcoordinates has been updated to ...".
  # Si no aparece, el comando no llego a la consola y se reintenta.
  if grep -qi "gamerule showcoordinates\|showcoordinates has been updated" /opt/minecraft/console.log 2>/dev/null; then
    break
  fi
done

# Forzar el guardado a disco.
#
# El gamerule anterior vive solo en memoria hasta que Bedrock escribe el mundo.
# Si la instancia se detiene y se vuelve a encender sin ese guardado, el valor
# se pierde y las coordenadas dejan de mostrarse. Se usa el mismo flujo que los
# respaldos: save hold (pausa escrituras), save query (escribe a disco) y
# save resume (reanuda). Se espera un margen antes de reanudar.
su - minecraft -c "screen -S minecraft -p 0 -X stuff 'save hold\015'"
sleep 5
su - minecraft -c "screen -S minecraft -p 0 -X stuff 'save query\015'"
sleep 10
su - minecraft -c "screen -S minecraft -p 0 -X stuff 'save resume\015'"
sleep 3
`;

/**
 * Reemplaza los marcadores del template por los valores de un servidor.
 * `name` y `difficulty` están validados por el esquema antes de llegar aquí.
 */
export function renderUserData(values: IUserDataValues): string {
  const replacements: Record<string, string> = {
    __BEDROCK_URL__: values.bedrockUrl,
    __SERVER_NAME__: values.serverName,
    __DIFFICULTY__: values.difficulty,
    __PATCH_LEVEL_DAT__:
      values.bonusChest || values.startingMap ? 'true' : 'false',
    __BONUS_CHEST__: values.bonusChest ? '1' : '0',
    __STARTING_MAP__: values.startingMap ? '1' : '0',
    __GAMERULE_SHOW_COORDINATES__: values.showCoordinates ? 'true' : 'false',
  };

  return Object.entries(replacements).reduce(
    (script, [marker, value]) => script.replaceAll(marker, value),
    USER_DATA_TEMPLATE,
  );
}
