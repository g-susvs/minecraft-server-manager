import dotenv from 'dotenv';
import type { IEnvironment } from './env.interface';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const environment: IEnvironment = {
  port: Number(process.env.PORT) || 3000,
  aws: {
    region: required('AWS_REGION'),
    roleArn: required('AWS_ROLE_ARN'),
  },
  ec2: {
    amiId: required('EC2_AMI_ID'),
    instanceType: process.env.EC2_INSTANCE_TYPE ?? 't3.small',
    subnetId: required('EC2_SUBNET_ID'),
    securityGroupId: required('EC2_SECURITY_GROUP_ID'),
  },
  tags: {
    managedBy: process.env.TAG_MANAGED_BY ?? 'minecraft-manager',
    application: process.env.TAG_APPLICATION ?? 'minecraft-bedrock',
  },
  minecraft: {
    bedrockServerUrl: required('BEDROCK_SERVER_URL'),
  },
};
