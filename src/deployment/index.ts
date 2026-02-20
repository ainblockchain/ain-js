import Provider from '../provider';
import {
  DeployConfig,
  DeployResult,
  ContainerStatus,
  ContainerLogs,
  AuthorizeResult,
} from './types';

/**
 * A class for the deployment module of AIN blockchain.
 * Manages Docker container deployments on AIN blockchain nodes
 * via CI/CD pipeline (GitHub Actions -> GHCR -> AIN node).
 */
export default class Deployment {
  private _provider: Provider;

  /**
   * Creates a new Deployment object.
   * @param {Provider} provider The network provider object.
   */
  constructor(provider: Provider) {
    this._provider = provider;
  }

  /**
   * Deploy a container from an authorized registry (e.g., GHCR).
   * The image must be from a registry authorized via authorize().
   */
  async deploy(config: DeployConfig): Promise<DeployResult> {
    const result = await this._provider.send('ain_deployment_deploy', {
      image: config.image,
      name: config.name,
      envVars: config.envVars,
      ports: config.ports,
    });
    return result as DeployResult;
  }

  /**
   * Get the status of a deployed container.
   */
  async status(containerName: string): Promise<ContainerStatus> {
    const result = await this._provider.send('ain_deployment_status', {
      name: containerName,
    });
    return result as ContainerStatus;
  }

  /**
   * Stop and remove a deployed container.
   */
  async stop(containerName: string): Promise<ContainerStatus> {
    const result = await this._provider.send('ain_deployment_stop', {
      name: containerName,
    });
    return result as ContainerStatus;
  }

  /**
   * Get logs from a deployed container.
   * @param {string} containerName The container name.
   * @param {number} tail Number of lines from the end (default 100, max 1000).
   */
  async logs(containerName: string, tail: number = 100): Promise<ContainerLogs> {
    const result = await this._provider.send('ain_deployment_logs', {
      name: containerName,
      tail,
    });
    return result as ContainerLogs;
  }

  /**
   * Authorize a GitHub username's GHCR namespace for deployments.
   * After authorization, images from ghcr.io/<username>/* are trusted.
   * This is bound to the passkey-authenticated GitHub identity.
   */
  async authorize(githubUsername: string): Promise<AuthorizeResult> {
    const result = await this._provider.send('ain_deployment_authorize', {
      github_username: githubUsername,
    });
    return result as AuthorizeResult;
  }

  /**
   * List all managed deployments on this node.
   */
  async list(): Promise<ContainerStatus[]> {
    const result = await this._provider.send('ain_deployment_list', {});
    return result as ContainerStatus[];
  }
}
