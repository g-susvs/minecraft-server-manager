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
      SecurityGroupIds: [environment.ec2.securityGroupId],
      SubnetId: environment.ec2.subnetId,
      UserData: userData,
      IamInstanceProfile: environment.ec2.instanceProfile
        ? { Name: environment.ec2.instanceProfile }
        : undefined,
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
