import {
  StartInstancesCommand,
  StopInstancesCommand,
  DescribeInstancesCommand,
  RunInstancesCommand,
  type Instance,
  type _InstanceType,
} from '@aws-sdk/client-ec2';
import { ec2Client } from '../config/aws';
import { environment } from '../config/environment';
import type { IServerProvider } from '../../domain/repositories/server.provider.interface';
import type {
  IServer,
  TServerStatus,
} from '../../domain/entities/server.entity';

function toServer(instance: Instance): IServer {
  return {
    instanceId: instance.InstanceId ?? '',
    name: instance.Tags?.find((tag) => tag.Key === 'Name')?.Value ?? '',
    status: (instance.State?.Name ?? 'unknown') as TServerStatus,
    publicIp: instance.PublicIpAddress ?? null,
  };
}

export class EC2Provider implements IServerProvider {
  /**
   * Crea una instancia con los tags que la identifican como administrada por
   * la aplicación (sección 6 del plan).
   */
  async create(name: string, userData: string): Promise<IServer> {
    const command = new RunInstancesCommand({
      MinCount: 1,
      MaxCount: 1,
      ImageId: environment.ec2.amiId,
      InstanceType: environment.ec2.instanceType as _InstanceType,
      UserData: userData,
      /**
       * La IP pública se pide explícitamente en vez de depender del atributo
       * `MapPublicIpOnLaunch` de la subnet: sin esto la instancia nace sin IP
       * pública y los jugadores no pueden conectarse.
       *
       * Se usa la IP auto-asignada (no una Elastic IP) porque solo se cobra
       * mientras la instancia corre; una EIP se cobra 24/7 incluso con el
       * servidor apagado. La contrapartida es que la IP cambia en cada
       * arranque, por eso `findById` la relee en cada consulta.
       *
       * `SubnetId` y `Groups` van dentro de la interfaz: AWS rechaza el
       * request si además se declaran a nivel raíz.
       */
      NetworkInterfaces: [
        {
          DeviceIndex: 0,
          AssociatePublicIpAddress: true,
          SubnetId: environment.ec2.subnetId,
          Groups: [environment.ec2.securityGroupId],
          DeleteOnTermination: true,
        },
      ],
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: name },
            { Key: 'ManagedBy', Value: environment.tags.managedBy },
            { Key: 'Application', Value: environment.tags.application },
          ],
        },
      ],
    });

    const result = await ec2Client.send(command);
    const instance = result.Instances?.[0];

    if (!instance) {
      throw new Error('EC2 did not return the created instance');
    }

    return toServer(instance);
  }

  async start(instanceId: string): Promise<TServerStatus> {
    const command = new StartInstancesCommand({ InstanceIds: [instanceId] });
    const result = await ec2Client.send(command);
    return (result.StartingInstances?.[0]?.CurrentState?.Name ??
      'unknown') as TServerStatus;
  }

  async stop(instanceId: string): Promise<TServerStatus> {
    const command = new StopInstancesCommand({ InstanceIds: [instanceId] });
    const result = await ec2Client.send(command);
    return (result.StoppingInstances?.[0]?.CurrentState?.Name ??
      'unknown') as TServerStatus;
  }

  async findById(instanceId: string): Promise<IServer | null> {
    const command = new DescribeInstancesCommand({ InstanceIds: [instanceId] });
    const result = await ec2Client.send(command);
    const instance = result.Reservations?.[0]?.Instances?.[0];

    return instance ? toServer(instance) : null;
  }

  /**
   * Filtra por tags para no exponer instancias de otros proyectos, y descarta
   * las terminadas para que no queden colgadas en el listado.
   */
  async findAllManaged(): Promise<IServer[]> {
    const command = new DescribeInstancesCommand({
      Filters: [
        { Name: 'tag:ManagedBy', Values: [environment.tags.managedBy] },
        { Name: 'tag:Application', Values: [environment.tags.application] },
        {
          Name: 'instance-state-name',
          Values: ['pending', 'running', 'stopping', 'stopped'],
        },
      ],
    });

    const result = await ec2Client.send(command);

    return (result.Reservations ?? []).flatMap((reservation) =>
      (reservation.Instances ?? []).map(toServer),
    );
  }
}
