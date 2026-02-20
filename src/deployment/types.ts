/**
 * Configuration for deploying a container.
 */
export interface DeployConfig {
  /** Docker image to deploy (must be from authorized registry) */
  image: string;
  /** Container name (optional, auto-generated if not provided) */
  name?: string;
  /** Environment variables for the container */
  envVars?: Record<string, string>;
  /** Port mappings: { hostPort: containerPort } */
  ports?: Record<string, string>;
}

/**
 * Result of a deployment operation.
 */
export interface DeployResult {
  containerId: string;
  containerName: string;
  image: string;
  status: string;
  started_at: number;
}

/**
 * Container status information.
 */
export interface ContainerStatus {
  containerName: string;
  containerId?: string;
  image?: string;
  status: string;
  started_at?: number;
}

/**
 * Container logs.
 */
export interface ContainerLogs {
  containerName: string;
  logs: string;
}

/**
 * Authorization result.
 */
export interface AuthorizeResult {
  authorized: boolean;
  registry: string;
}
