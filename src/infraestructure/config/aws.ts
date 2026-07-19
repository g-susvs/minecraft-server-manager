import { EC2Client } from '@aws-sdk/client-ec2';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { environment } from './environment';

const { region, roleArn } = environment.aws;

/**
 * El cliente nunca usa credenciales con permisos directos sobre EC2.
 *
 * Las credenciales del entorno (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) solo
 * sirven para asumir `roleArn` vía STS. Lo que la aplicación usa son
 * credenciales temporales del rol, que el SDK renueva solo al caducar.
 */
export const ec2Client = new EC2Client({
  region,
  credentials: fromTemporaryCredentials({
    params: {
      RoleArn: roleArn,
    },
    clientConfig: { region },
  }),
});
