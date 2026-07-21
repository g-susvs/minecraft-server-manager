# Minecraft Server Manager - Backend

Backend para el aprovisionamiento y la administración de servidores de **Minecraft Bedrock** sobre instancias de AWS EC2, construido con **Node.js, TypeScript y Express 5**.

---

## 🏛️ Arquitectura del Sistema

El proyecto sigue una **arquitectura hexagonal (puertos y adaptadores)**: el dominio y los casos de uso no conocen ni a Express ni al SDK de AWS; se comunican con el exterior a través de interfaces que la capa de infraestructura implementa.

### Descripción de Capas

1. **Dominio (`src/domain/`)**
   - `entities/server.entity.ts`: entidades y tipos del negocio (`IServer`, `ICreateServerInput`), junto con las listas cerradas `SERVER_STATUSES` y `SERVER_DIFFICULTIES`. Es la única fuente de verdad: los esquemas de validación y la documentación OpenAPI derivan de aquí.
   - `repositories/`: los **puertos**. `IServerProvider` describe qué se puede hacer con un servidor (crear, arrancar, detener, consultar, listar) sin decir cómo. `IAppContext` agrupa los proveedores disponibles.

2. **Aplicación (`src/application/`)**
   - `server/server.use.cases.ts`: casos de uso. Orquesta el proveedor y genera el script de **User Data** en Base64 que auto-aprovisiona la instancia. Lanza `AppError.notFound` cuando la instancia no existe.

3. **Infraestructura (`src/infraestructure/`)**
   - `aws/ec2.priveder.ts`: **adaptador** de `IServerProvider` sobre `@aws-sdk/client-ec2` (`RunInstances`, `StartInstances`, `StopInstances`, `DescribeInstances`).
   - `config/aws.ts`: cliente EC2 con credenciales **temporales vía STS** (`fromTemporaryCredentials`). Las claves del entorno solo sirven para asumir `AWS_ROLE_ARN`; la aplicación nunca opera con permisos directos sobre EC2.
   - `config/environment/`: carga y valida las variables de entorno al arrancar. Si falta una requerida, el proceso falla con un mensaje explícito en lugar de romperse más tarde.
   - `config/app-context.ts`: inyección de dependencias — construye el `AppContext` con las implementaciones concretas.
   - `api.ts`: monta `/health`, `/docs` y registra automáticamente cada router por su `basePath`.

4. **Presentación (`src/presentation/`)**
   - `routes/`: define los endpoints y encadena los middlewares de validación.
   - `schemas/`: esquemas **Zod** de body y params.
   - `controllers/`: traduce HTTP ↔ casos de uso y delega los errores a `next()`.
   - `middlewares/`: `validateBody` / `validateParams` y el manejador central de errores.
   - `responses/app.response.ts`: envoltorio uniforme de respuesta.
   - `docs/`: especificación OpenAPI y Swagger UI.

5. **Librerías (`src/libs/`)**
   - `app.error.ts`: `AppError` con código HTTP asociado (`badRequest`, `notFound`).
   - `logger.ts`: utilidades de log.

---

## 🚀 Endpoints de la API

La API completa se monta bajo el prefijo `/api`, y los endpoints de servidores bajo `/api/server`:

| Método | Endpoint | Acción / Descripción | Controlador |
|:---|:---|:---|:---|
| **GET** | `/api/server` | Lista únicamente las instancias administradas por la app (filtradas por tags, excluyendo las terminadas). | `ServerController.listServers` |
| **POST** | `/api/server` | Crea y aprovisiona una nueva instancia EC2 con Minecraft Bedrock instalado y configurado. | `ServerController.createServer` |
| **GET** | `/api/server/:instanceId` | Obtiene el estado actual y la IP pública de una instancia. | `ServerController.getServer` |
| **POST** | `/api/server/:instanceId/start` | Enciende la instancia indicada. | `ServerController.startServer` |
| **POST** | `/api/server/:instanceId/stop` | Apaga la instancia indicada. | `ServerController.stopServer` |
| **GET** | `/api/health` | Diagnóstico simple de la salud de la API. | *(Enrutador principal)* |
| **GET** | `/api/docs` | Swagger UI interactivo. | `docsRouter` |
| **GET** | `/api/docs/json` | Especificación OpenAPI en JSON. | `docsRouter` |

> `:instanceId` se valida contra el formato de EC2 (`i-` + 8 o 17 caracteres hex) antes de llegar a AWS, para no gastar una llamada por cada ruta mal escrita.

### Formato de respuesta

Todas las respuestas correctas se emiten con la misma envoltura (`AppResponse`, HTTP 200):

```json
{
  "message": "",
  "success": true,
  "data": {}
}
```

Los errores los formatea `errorMiddleware`:

```json
{
  "message": "Server not found: i-0123456789abcdef0",
  "success": false
}
```

---

## 🛠️ Aprovisionamiento Automatizado (User Data)

Al llamar a `POST /api/server`, el caso de uso genera un script que AWS ejecuta como root en el primer arranque de la instancia:

1. Actualiza el sistema e instala dependencias (`wget`, `unzip`, `screen`, `curl`).
2. Crea el usuario de sistema aislado `minecraft` con home en `/opt/minecraft`.
3. Descarga y descomprime el servidor Bedrock desde `BEDROCK_SERVER_URL` en `/opt/minecraft/server`.
4. Ajusta `server.properties`: desactiva `allow-list` (el paquete oficial viene con la lista blanca activa y vacía, lo que rechazaría a todos los jugadores) y aplica `server-name` y `difficulty`.
5. Crea el servicio **systemd** `minecraft.service`, que arranca el juego **dentro de `screen`** para conservar acceso a la consola de Bedrock. `ExecStop` envía el comando `stop` para guardar el mundo y cerrar ordenadamente en lugar de un SIGTERM en seco. `Restart=on-failure` lo levanta ante caídas.
6. Espera a que el mundo esté cargado (`Server started.` en `/opt/minecraft/console.log`).
7. Si se pidió `bonusChest` o `startingMap`, detiene el servicio y parchea los flags NBT del `level.dat` en el sitio, sin alterar el tamaño del archivo, y vuelve a arrancar.
8. Aplica el gamerule `showcoordinates` al final, con reintentos, cuando ya no queda ningún reinicio por delante que pudiera perderlo.

Los logs del juego quedan en `/opt/minecraft/console.log` (no en `journalctl`, porque `screen` se queda con la salida).

---

## ⚙️ Configuración (.env)

Crea un archivo `.env` en la raíz de `backend/` (puedes partir de `.example.env`):

```env
PORT=3000

AWS_REGION=us-east-1
AWS_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/minecraft-server-manager-role
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

EC2_AMI_ID=ami-xxxxxxxxxxxxxxxxx
EC2_INSTANCE_TYPE=t2.small
EC2_SUBNET_ID=subnet-xxxxxxxxxxxxxxxxx
EC2_SECURITY_GROUP_ID=sg-xxxxxxxxxxxxxxxxx

TAG_MANAGED_BY=minecraft-manager
TAG_APPLICATION=minecraft-bedrock

BEDROCK_SERVER_URL=https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.33.2.zip
```

| Variable | Requerida | Por defecto | Descripción |
|:---|:---:|:---|:---|
| `PORT` | No | `3000` | Puerto HTTP del servidor Express. |
| `AWS_REGION` | **Sí** | — | Región donde se crean y gestionan las instancias. |
| `AWS_ROLE_ARN` | **Sí** | — | Rol IAM que la aplicación asume vía STS para operar sobre EC2. |
| `AWS_ACCESS_KEY_ID` | **Sí**\* | — | Credencial base; solo necesita permiso para asumir el rol. |
| `AWS_SECRET_ACCESS_KEY` | **Sí**\* | — | Par de la anterior. |
| `EC2_AMI_ID` | **Sí** | — | AMI base (Ubuntu/Debian con `apt-get`). |
| `EC2_INSTANCE_TYPE` | No | `t3.small` | Tipo de instancia a lanzar. |
| `EC2_SUBNET_ID` | **Sí** | — | Subred donde se crea la interfaz de red. |
| `EC2_SECURITY_GROUP_ID` | **Sí** | — | Security group; debe permitir UDP 19132 para Bedrock. |
| `TAG_MANAGED_BY` | No | `minecraft-manager` | Tag usado para filtrar las instancias administradas. |
| `TAG_APPLICATION` | No | `minecraft-bedrock` | Segundo tag de filtrado. |
| `BEDROCK_SERVER_URL` | **Sí** | — | URL del ZIP oficial del servidor Bedrock a instalar. |

\* Las lee el SDK de AWS directamente del entorno. Si la aplicación corre sobre una instancia o contenedor con un rol de instancia asociado, pueden omitirse.

Las variables marcadas como requeridas se comprueban al arrancar: si falta alguna, el proceso termina con `Missing required environment variable: <NOMBRE>`.

---

## 💻 Desarrollo y Ejecución

Desde la carpeta `backend/`:

1. **Instalar dependencias**
   ```bash
   npm install
   ```
2. **Modo desarrollo** (recarga en caliente con `tsx watch`)
   ```bash
   npm run dev
   ```
3. **Compilar** (bundle con `tsup` a `dist/`)
   ```bash
   npm run build
   ```
4. **Producción**
   ```bash
   npm start
   ```

Otros scripts disponibles:

| Script | Descripción |
|:---|:---|
| `npm run typecheck` | Verificación de tipos con `tsc` sin emitir. |
| `npm run format` | Formatea el proyecto con Prettier. |
| `npm run format:check` | Comprueba el formato sin escribir. |

Con el servidor levantado, la documentación interactiva está en `http://localhost:3000/api/docs`.
