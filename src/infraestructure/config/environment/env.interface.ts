export interface IEnvironment {
  port: number;
  aws: {
    region: string;
    roleArn: string;
  };
  ec2: {
    amiId: string;
    instanceType: string;
    subnetId: string;
    securityGroupId: string;
  };
  tags: {
    managedBy: string;
    application: string;
  };
  minecraft: {
    bedrockServerUrl: string;
  };
}
