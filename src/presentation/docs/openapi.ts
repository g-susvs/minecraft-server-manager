import {
  DEFAULT_SERVER_DIFFICULTY,
  SERVER_DIFFICULTIES,
  SERVER_STATUSES,
} from '../../domain/entities/server.entity';

export type TJsonSchema = Record<string, unknown>;

/** Respuesta que emite `AppResponse`. */
const okResponse = (description: string, data: TJsonSchema) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string', example: '' },
          success: { type: 'boolean', example: true },
          data,
        },
        required: ['message', 'success', 'data'],
      },
    },
  },
});

/** Respuesta de error `errorMiddleware`. */
const errorResponse = (description: string, example: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
      example: { message: example, success: false },
    },
  },
});

const instanceIdParam = {
  name: 'instanceId',
  in: 'path',
  required: true,
  description: 'ID de la instancia EC2 que hospeda el servidor',
  schema: {
    type: 'string',
    pattern: '^i-[0-9a-f]{8}([0-9a-f]{9})?$',
    example: 'i-0a1b2c3d4e5f60718',
  },
};

const validationError = errorResponse(
  'Los datos enviados no pasaron la validación. `details` lista cada campo que falló.',
  'Error de validación en body: name (name debe tener al menos 3 caracteres)',
);

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Minecraft Server Manager API',
    version: '1.0.0',
    description:
      'Gestión del ciclo de vida de servidores de Minecraft Bedrock alojados en instancias EC2: crear, listar, consultar estado, arrancar y detener.',
  },
  tags: [
    {
      name: 'Health',
      description: 'Comprobación de disponibilidad del servicio',
    },
    {
      name: 'Server',
      description: 'Ciclo de vida de los servidores de Minecraft',
    },
  ],

  components: {
    schemas: {
      CreateServerDto: {
        type: 'object',
        description: 'Parámetros de creación de un servidor de Minecraft',
        properties: {
          name: {
            type: 'string',
            minLength: 3,
            maxLength: 50,
            pattern: '^[a-zA-Z0-9 _-]+$',
            description: 'Nombre visible del servidor',
            example: 'Servidor de los panas',
          },
          difficulty: {
            type: 'string',
            enum: SERVER_DIFFICULTIES,
            default: DEFAULT_SERVER_DIFFICULTY,
            description: 'Dificultad del mundo',
          },
          showCoordinates: {
            type: 'boolean',
            default: true,
            description: 'Muestra las coordenadas en el HUD de los jugadores',
          },
          bonusChest: {
            type: 'boolean',
            default: false,
            description: 'Genera el cofre de bonificación junto al spawn',
          },
          startingMap: {
            type: 'boolean',
            default: false,
            description: 'Entrega un mapa vacío al empezar la partida',
          },
        },
        required: ['name'],
      },

      Server: {
        type: 'object',
        description: 'Servidor de Minecraft y la instancia EC2 que lo hospeda',
        properties: {
          instanceId: {
            type: 'string',
            example: 'i-0a1b2c3d4e5f60718',
          },
          name: { type: 'string', example: 'Servidor de los panas' },
          status: {
            type: 'string',
            enum: SERVER_STATUSES,
            description:
              'Estado de la instancia EC2. `unknown` cuando AWS devuelve un estado no contemplado.',
            example: 'running',
          },
          publicIp: {
            type: 'string',
            nullable: true,
            description:
              'IP a la que se conectan los jugadores (puerto 19132). Es `null` mientras el servidor no está arrancado.',
            example: '54.210.11.23',
          },
        },
        required: ['instanceId', 'name', 'status', 'publicIp'],
      },

      ServerStatusChange: {
        type: 'object',
        description: 'Resultado de una transición de estado solicitada',
        properties: {
          instanceId: { type: 'string', example: 'i-0a1b2c3d4e5f60718' },
          status: {
            type: 'string',
            enum: SERVER_STATUSES,
            description: 'Estado inmediatamente después de aceptar la orden',
            example: 'pending',
          },
        },
        required: ['instanceId', 'status'],
      },

      ErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          success: { type: 'boolean', example: false },
          details: {
            type: 'array',
            description: 'Presente solo en errores de validación',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'name' },
                message: {
                  type: 'string',
                  example: 'name debe tener al menos 3 caracteres',
                },
              },
            },
          },
        },
        required: ['message', 'success'],
      },
    },
  },

  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Comprueba que la API responde',
        responses: {
          200: {
            description: 'El servicio está operativo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'OK' },
                    success: { type: 'boolean', example: true },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/api/server': {
      get: {
        tags: ['Server'],
        summary: 'Lista los servidores gestionados',
        description:
          'Devuelve las instancias EC2 etiquetadas como gestionadas por esta aplicación, incluyendo su estado actual.',
        responses: {
          200: okResponse('Listado de servidores', {
            type: 'array',
            items: { $ref: '#/components/schemas/Server' },
          }),
          500: errorResponse('Fallo al consultar AWS', 'Internal server error'),
        },
      },

      post: {
        tags: ['Server'],
        summary: 'Crea un servidor',
        description: `Lanza una instancia EC2 nueva que se autoconfigura como servidor de Bedrock al arrancar. La instancia tarda unos minutos en quedar disponible: consulta \`GET /server/{instanceId}\` hasta que el estado sea \`running\` y \`publicIp\` deje de ser \`null\`.\n\nDificultades admitidas: ${SERVER_DIFFICULTIES.join(', ')}.`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateServerDto' },
            },
          },
        },
        responses: {
          200: okResponse('Servidor creado y arrancando', {
            $ref: '#/components/schemas/Server',
          }),
          400: validationError,
          500: errorResponse(
            'AWS rechazó el lanzamiento de la instancia',
            'Internal server error',
          ),
        },
      },
    },

    '/api/server/{instanceId}': {
      get: {
        tags: ['Server'],
        summary: 'Consulta el estado de un servidor',
        parameters: [instanceIdParam],
        responses: {
          200: okResponse('Estado actual del servidor', {
            $ref: '#/components/schemas/Server',
          }),
          400: validationError,
          404: errorResponse(
            'No existe una instancia con ese ID',
            'Servidor no encontrado',
          ),
        },
      },
    },

    '/api/server/{instanceId}/start': {
      post: {
        tags: ['Server'],
        summary: 'Arranca un servidor detenido',
        description:
          'La orden es asíncrona: la instancia pasa por `pending` antes de llegar a `running`. La IP pública cambia en cada arranque.',
        parameters: [instanceIdParam],
        responses: {
          200: okResponse('Orden de arranque aceptada', {
            $ref: '#/components/schemas/ServerStatusChange',
          }),
          400: validationError,
          404: errorResponse(
            'No existe una instancia con ese ID',
            'Servidor no encontrado',
          ),
        },
      },
    },

    '/api/server/{instanceId}/stop': {
      post: {
        tags: ['Server'],
        summary: 'Detiene un servidor en ejecución',
        description:
          'La orden es asíncrona: la instancia pasa por `stopping` antes de llegar a `stopped`. El mundo se conserva en el disco.',
        parameters: [instanceIdParam],
        responses: {
          200: okResponse('Orden de parada aceptada', {
            $ref: '#/components/schemas/ServerStatusChange',
          }),
          400: validationError,
          404: errorResponse(
            'No existe una instancia con ese ID',
            'Servidor no encontrado',
          ),
        },
      },
    },
  },
};
